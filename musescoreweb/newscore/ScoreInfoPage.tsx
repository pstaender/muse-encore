/*
 * SPDX-License-Identifier: GPL-3.0-only
 * "Additional score information" (MuseScore's ScoreInfoPage.qml with AdditionalInfoView and GeneralInfoView):
 * key signature, time signature, tempo, measures, and the texts of the title frame.
 */
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_NEW_SCORE_PICKUP, DEFAULT_NEW_SCORE_TEMPO, KEY_ATONAL, type NewScoreOptions } from '../../src/index'

export type ScoreInfo = Omit<NewScoreOptions, 'instruments' | 'order' | 'orderCustomized' | 'templateMscx' | 'templateStyle'>
type Tempo = NonNullable<NewScoreOptions['tempo']>
type Fraction = { numerator: number; denominator: number }

// AdditionalInfoModel::keySignatureList: sharps in the first row, atonal and flats in the second
const KEYS: { major: string; minor: string; icon: string; key: number }[] = [
    { major: 'C major', minor: 'A minor', icon: '', key: 0 },
    { major: 'G major', minor: 'E minor', icon: '', key: 1 },
    { major: 'D major', minor: 'B minor', icon: '', key: 2 },
    { major: 'A major', minor: 'F♯ minor', icon: '', key: 3 },
    { major: 'E major', minor: 'C♯ minor', icon: '', key: 4 },
    { major: 'B major', minor: 'G♯ minor', icon: '', key: 5 },
    { major: 'F♯ major', minor: 'D♯ minor', icon: '', key: 6 },
    { major: 'C♯ major', minor: 'A♯ minor', icon: '', key: 7 },
    { major: 'Open/Atonal', minor: 'Open/Atonal', icon: '', key: KEY_ATONAL },
    { major: 'F major', minor: 'D minor', icon: '', key: -1 },
    { major: 'B♭ major', minor: 'G minor', icon: '', key: -2 },
    { major: 'E♭ major', minor: 'C minor', icon: '', key: -3 },
    { major: 'A♭ major', minor: 'F minor', icon: '', key: -4 },
    { major: 'D♭ major', minor: 'B♭ minor', icon: '', key: -5 },
    { major: 'G♭ major', minor: 'E♭ minor', icon: '', key: -6 },
    { major: 'C♭ major', minor: 'A♭ minor', icon: '', key: -7 },
]

const DENOMINATORS = [1, 2, 4, 8, 16, 32, 64, 128] // AdditionalInfoModel::timeSignatureDenominators

// SMuFL code points (shown in Leland)
const SMUFL = {
    digits: '', // timeSig0 .. timeSig9
    common: '',
    cut: '',
    notes: { whole: '', half: '', quarter: '', eighth: '', '16th': '' } as Record<Tempo['duration'], string>,
    dot: '',
}

// AdditionalInfoModel::tempoNotes
const TEMPO_NOTES: { duration: Tempo['duration']; dot: boolean; label: string }[] = [
    { duration: '16th', dot: false, label: '16th note' },
    { duration: '16th', dot: true, label: 'Dotted 16th note' },
    { duration: 'eighth', dot: false, label: 'Eighth note' },
    { duration: 'eighth', dot: true, label: 'Dotted eighth note' },
    { duration: 'quarter', dot: false, label: 'Quarter note' },
    { duration: 'quarter', dot: true, label: 'Dotted quarter note' },
    { duration: 'half', dot: false, label: 'Half note' },
    { duration: 'half', dot: true, label: 'Dotted half note' },
    { duration: 'whole', dot: false, label: 'Whole note' },
]


function timeSigDigits(n: number): string {
    return String(n).replace(/\d/g, d => String.fromCharCode(SMUFL.digits.charCodeAt(0) + Number(d)))
}

/**
 * A time signature in the music font. SMuFL time signature digits are centered on the baseline (2 staff spaces high,
 * 1 em = 4 staff spaces), which CSS line boxes cannot place exactly, so it is an SVG.
 */
function TimeSigView({ numerator, denominator, symbol }: { numerator?: number; denominator?: number; symbol?: string }): React.JSX.Element {
    const em = 32
    const sp = em / 4
    const width = Math.max(String(numerator ?? '').length, String(denominator ?? '').length, 1) * 2.2 * sp
    return (
        <svg className="timesig" width={width} height={4 * sp} viewBox={`0 0 ${width} ${4 * sp}`} aria-hidden="true">
            {symbol
                ? <text x={width / 2} y={2 * sp} fontSize={em} textAnchor="middle">{symbol}</text>
                : <>
                    <text x={width / 2} y={sp} fontSize={em} textAnchor="middle">{timeSigDigits(numerator!)}</text>
                    <text x={width / 2} y={3 * sp} fontSize={em} textAnchor="middle">{timeSigDigits(denominator!)}</text>
                </>}
        </svg>
    )
}

function noteSymbol(duration: Tempo['duration'], dot: boolean): string {
    return SMUFL.notes[duration] + (dot ? ` ${SMUFL.dot}` : '')
}

function clampInt(v: string, min: number, max: number, def: number): number {
    const n = Math.round(Number(v))
    return Number.isFinite(n) && v.trim() !== '' ? Math.min(max, Math.max(min, n)) : def
}

/** a button with a panel below it; the panel closes on Escape and on a click outside */
function Dropdown({ label, value, valueLabel, children }: {
    label: string
    value: React.ReactNode
    valueLabel: string
    children: React.ReactNode
}): React.JSX.Element {
    const [open, setOpen] = useState(false)
    const wrap = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!open) {
            return
        }
        const onDown = (e: PointerEvent): void => {
            if (!wrap.current?.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('pointerdown', onDown)
        return () => document.removeEventListener('pointerdown', onDown)
    }, [open])
    return (
        <div className="dropdown" ref={wrap} onKeyDown={e => {
            if (e.key === 'Escape' && open) {
                // only the panel, not the dialog
                e.preventDefault()
                e.stopPropagation()
                setOpen(false)
                wrap.current?.querySelector<HTMLButtonElement>('.dropdown-button')?.focus()
            }
        }}>
            <span className="field-label">{label}</span>
            <button className="dropdown-button" aria-expanded={open} aria-label={`${label}: ${valueLabel}`}
                onClick={() => setOpen(!open)}>
                <span className="dropdown-value">{value}</span>
                <span className="chevron" aria-hidden="true">{''}</span>
            </button>
            {open && <div className="dropdown-panel" role="group" aria-label={label}>{children}</div>}
        </div>
    )
}

function FractionInput({ value, onChange, label }: { value: Fraction; onChange: (f: Fraction) => void; label: string }): React.JSX.Element {
    return (
        <span className="fraction-input" role="group" aria-label={label}>
            <input type="number" min={1} max={63} aria-label="Numerator" value={value.numerator}
                onChange={e => onChange({ ...value, numerator: clampInt(e.target.value, 1, 63, value.numerator) })} />
            <span aria-hidden="true">/</span>
            <select aria-label="Denominator" value={value.denominator}
                onChange={e => onChange({ ...value, denominator: Number(e.target.value) })}>
                {DENOMINATORS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
        </span>
    )
}

export function ScoreInfoPage({ info, setInfo }: { info: ScoreInfo; setInfo: (i: ScoreInfo) => void }): React.JSX.Element {
    const [minor, setMinor] = useState(false)
    // the values stay while the tempo or the pickup measure is switched off
    const lastTempo = useRef<Tempo>(info.tempo ?? { ...DEFAULT_NEW_SCORE_TEMPO })
    const lastPickup = useRef<Fraction>(info.pickup ?? { ...DEFAULT_NEW_SCORE_PICKUP })
    const [fraction, setFraction] = useState<Fraction>(info.timesigType === 'normal' ? info.timesig : { numerator: 4, denominator: 4 })
    const set = (patch: Partial<ScoreInfo>): void => setInfo({ ...info, ...patch })

    const key = KEYS.find(k => k.key === info.key) ?? KEYS[0]
    const keyName = minor ? key.minor : key.major
    const tempo = info.tempo ?? lastTempo.current
    const pickup = info.pickup ?? lastPickup.current

    const setTempo = (t: Partial<Tempo>): void => {
        lastTempo.current = { ...tempo, ...t }
        set({ tempo: lastTempo.current })
    }
    const setPickup = (p: Fraction): void => {
        lastPickup.current = p
        set({ pickup: p })
    }
    // AdditionalInfoModel::timeSignature: common time is 4/4, cut time 2/2
    const setTimeSig = (type: ScoreInfo['timesigType'], f = fraction): void => {
        setFraction(f)
        set({
            timesigType: type,
            timesig: type === 'common' ? { numerator: 4, denominator: 4 } : type === 'cut' ? { numerator: 2, denominator: 2 } : f,
        })
    }

    const timeSigLabel = info.timesigType === 'common' ? 'Common time' : info.timesigType === 'cut' ? 'Cut time'
        : `${info.timesig.numerator}/${info.timesig.denominator}`
    const timeSigValue = info.timesigType === 'common' ? <TimeSigView symbol={SMUFL.common} />
        : info.timesigType === 'cut' ? <TimeSigView symbol={SMUFL.cut} />
        : <TimeSigView numerator={info.timesig.numerator} denominator={info.timesig.denominator} />
    const tempoNote = TEMPO_NOTES.find(n => n.duration === tempo.duration && n.dot === tempo.dot) ?? TEMPO_NOTES[4]
    const measuresLabel = `${info.measures} ${info.measures === 1 ? 'measure' : 'measures'}, `
        + (info.pickup ? `pickup: ${info.pickup.numerator}/${info.pickup.denominator}` : 'no pickup')

    return (
        <div className="score-info">
            <h3>Additional score information</h3>
            <div className="score-options" role="group" aria-label="Score options">
                <Dropdown label="Key signature" valueLabel={keyName}
                    value={<><span className="icon-glyph big" aria-hidden="true">{key.icon}</span><span className="value-text">{keyName}</span></>}>
                    <div className="segmented text" role="radiogroup" aria-label="Mode">
                        <button role="radio" aria-checked={!minor} onClick={() => setMinor(false)}>Major</button>
                        <button role="radio" aria-checked={minor} onClick={() => setMinor(true)}>Minor</button>
                    </div>
                    <div className="key-grid" role="radiogroup" aria-label="Key signature">
                        {KEYS.map(k => (
                            <button key={k.key} role="radio" aria-checked={k.key === info.key} title={minor ? k.minor : k.major}
                                onClick={() => set({ key: k.key })}>
                                <span className="icon-glyph big" aria-hidden="true">{k.icon}</span>
                                <span className="key-name">{minor ? k.minor : k.major}</span>
                            </button>
                        ))}
                    </div>
                </Dropdown>

                <Dropdown label="Time signature" valueLabel={timeSigLabel} value={timeSigValue}>
                    <div className="radio-rows" role="radiogroup" aria-label="Time signature">
                        <label>
                            <input type="radio" name="timesig" checked={info.timesigType === 'normal'} onChange={() => setTimeSig('normal')} />
                            <FractionInput label="Time signature" value={fraction} onChange={f => setTimeSig('normal', f)} />
                        </label>
                        <label>
                            <input type="radio" name="timesig" checked={info.timesigType === 'common'} onChange={() => setTimeSig('common')} />
                            <TimeSigView symbol={SMUFL.common} /> Common time
                        </label>
                        <label>
                            <input type="radio" name="timesig" checked={info.timesigType === 'cut'} onChange={() => setTimeSig('cut')} />
                            <TimeSigView symbol={SMUFL.cut} /> Cut time
                        </label>
                    </div>
                </Dropdown>

                <Dropdown label="Tempo" valueLabel={info.tempo ? `${tempoNote.label} = ${tempo.bpm}` : 'None'}
                    value={info.tempo
                        ? <span className="tempo-value"><span className="smufl" aria-hidden="true">{noteSymbol(tempo.duration, tempo.dot)}</span> = {tempo.bpm}</span>
                        : <span className="value-text muted">None</span>}>
                    <label className="check">
                        <input type="checkbox" checked={!!info.tempo} onChange={e => set({ tempo: e.target.checked ? tempo : null })} />
                        Show tempo marking on my score
                    </label>
                    <div className="tempo-row">
                        <select aria-label="Note value" disabled={!info.tempo} value={TEMPO_NOTES.indexOf(tempoNote)}
                            onChange={e => {
                                const n = TEMPO_NOTES[Number(e.target.value)]
                                setTempo({ duration: n.duration, dot: n.dot })
                            }}>
                            {TEMPO_NOTES.map((n, i) => <option key={i} value={i}>{n.label}</option>)}
                        </select>
                        <span aria-hidden="true">=</span>
                        <input type="number" min={20} max={400} aria-label="Beats per minute" disabled={!info.tempo} value={tempo.bpm}
                            onChange={e => setTempo({ bpm: clampInt(e.target.value, 20, 400, tempo.bpm) })} />
                    </div>
                </Dropdown>

                <Dropdown label="Measures" valueLabel={measuresLabel} value={<span className="value-text">{measuresLabel}</span>}>
                    <label className="check">
                        <input type="checkbox" checked={!!info.pickup} onChange={e => set({ pickup: e.target.checked ? pickup : null })} />
                        Create pickup measure
                    </label>
                    <div className="indent">
                        <FractionInput label="Pickup measure duration" value={pickup} onChange={setPickup} />
                    </div>
                    <label className="field">
                        <span>Initial number of measures</span>
                        <input type="number" min={1} max={9999} value={info.measures}
                            onChange={e => set({ measures: clampInt(e.target.value, 1, 9999, info.measures) })} />
                    </label>
                    <p className="muted hint">Hint: You can also add &amp; delete measures after you have created your score</p>
                </Dropdown>
            </div>

            <div className="general-info" role="group" aria-label="General score info">
                <label className="field">
                    <span>Title</span>
                    <input type="text" placeholder="Untitled score" value={info.title ?? ''} autoFocus
                        onChange={e => set({ title: e.target.value })} />
                </label>
                <label className="field">
                    <span>Composer</span>
                    <input type="text" placeholder="Composer / arranger" value={info.composer ?? ''}
                        onChange={e => set({ composer: e.target.value })} />
                </label>
                <label className="field">
                    <span>Subtitle</span>
                    <input type="text" value={info.subtitle ?? ''} onChange={e => set({ subtitle: e.target.value })} />
                </label>
                <label className="field">
                    <span>Lyricist</span>
                    <input type="text" value={info.lyricist ?? ''} onChange={e => set({ lyricist: e.target.value })} />
                </label>
                <label className="field wide">
                    <span>Copyright</span>
                    <input type="text" value={info.copyright ?? ''} onChange={e => set({ copyright: e.target.value })} />
                </label>
            </div>
        </div>
    )
}
