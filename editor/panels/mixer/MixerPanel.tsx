/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The mixer panel below the score (MuseScore's DockPanel "mixerPanel" with MixerPanel.qml: View > Mixer, F10):
 * one strip per track (the instruments of the parts, their chord symbols, the metronome) and the master, in rows
 * with a header column like MuseScore's sections: Pan, Volume, Fader, Mute and solo, Name. The values are the
 * project's audio settings (audiosettings.json, saved in the .mscz like MuseScore 4); changing them makes the score
 * modified. Not ported: the Sound, Audio FX and Aux sends sections (the browser plays MS Basic only), the meters,
 * the context menu that hides sections. The height can be changed with the splitter above it.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
    BALANCE_SCALING_FACTOR, MIXER_VOLUME_MAX, MIXER_VOLUME_MIN, mixerChannels, onMixerChanged, setMixerChannel,
    type MasterScore, type MixerChannel,
} from '../../../src/index'
import { registerAction } from '../../actions/actions'
import { ICON_CODES } from '../../actions/uiactiondata'
import { qtrc, useLanguage } from '../../i18n'
import { currentScore, scoreSaved, scoreViewState, useScoreView } from '../../scoreview'
import { onSettingsChanged, settings, updateSettings } from '../../settings'
import './mixer.css'

/** NotationPage.qml horizontalPanelMinHeight / horizontalPanelMaxHeight */
export const MIXER_MIN_HEIGHT = 100
export const MIXER_MAX_HEIGHT = 520

export function isMixerOpen(): boolean {
    return settings().mixer.open
}

export function setMixerOpen(open: boolean): void {
    updateSettings('mixer', { open })
}

function setMixerHeight(height: number): void {
    updateSettings('mixer', { height: Math.round(Math.max(MIXER_MIN_HEIGHT, Math.min(MIXER_MAX_HEIGHT, height))) })
}

/** toggle-mixer (ApplicationActionController::toggleDock of the mixer panel) and its Close */
export function registerMixerActions(): void {
    registerAction('toggle-mixer', {
        run: () => setMixerOpen(!isMixerOpen()),
        enabled: () => scoreViewState().hasScore,
        checked: isMixerOpen,
    })
    registerAction('dock-close:mixerPanel', { run: () => setMixerOpen(false) }, { title: ['appshell/dock', 'Close'] })
}

function masterScore(): MasterScore | null {
    return currentScore()?.masterScore() ?? null
}

/** re-renders when the mixer of the score or the settings (the panel's state) change */
function useMixerVersion(score: MasterScore | null): void {
    const [, setVersion] = useState(0)
    useSyncExternalStore(onSettingsChanged, settings)
    useEffect(() => score ? onMixerChanged(score, () => setVersion(v => v + 1)) : undefined, [score])
}

function setChannel(key: string, values: Parameters<typeof setMixerChannel>[2]): void {
    const score = masterScore()
    if (score) {
        setMixerChannel(score, key, values)
        // the audio settings make the project modified (NotationProject::isModified)
        scoreSaved()
    }
}

/** MixerVolumeSection's text field: the volume in dB with one decimal ("-inf"-like minimum shown as the number) */
function formatDb(db: number): string {
    return (Math.round(db * 10) / 10).toFixed(1)
}

function Strip({ channel, row }: { channel: MixerChannel; row: 'pan' | 'volume' | 'fader' | 'muteSolo' | 'name' }): React.JSX.Element {
    const title = channel.title
    switch (row) {
    case 'pan': {
        const value = Math.round(channel.balance * BALANCE_SCALING_FACTOR)
        return (
            <div className="mixer-cell">
                <input type="range" className="mixer-pan" min={-100} max={100} step={1} value={value}
                    aria-label={`${title} ${qtrc('playback', 'Pan')}`} title={String(value)}
                    onChange={(e) => setChannel(channel.key, { balance: Number(e.currentTarget.value) / BALANCE_SCALING_FACTOR })}
                    onDoubleClick={() => setChannel(channel.key, { balance: 0 })} />
                <span className="mixer-value">{value}</span>
            </div>
        )
    }
    case 'volume':
        return (
            <div className="mixer-cell">
                <input key={formatDb(channel.volumeDb)} type="number" className="mixer-volume" min={MIXER_VOLUME_MIN} max={MIXER_VOLUME_MAX} step={0.1}
                    defaultValue={formatDb(channel.volumeDb)} aria-label={`${title} ${qtrc('playback', 'Volume')}`}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.currentTarget.blur()
                        }
                        e.stopPropagation()
                    }}
                    onBlur={(e) => {
                        const v = Number(e.currentTarget.value)
                        if (Number.isFinite(v)) {
                            setChannel(channel.key, { volumeDb: v })
                        }
                    }} />
            </div>
        )
    case 'fader':
        return (
            <div className="mixer-cell mixer-fader-cell">
                <input type="range" className="mixer-fader" min={MIXER_VOLUME_MIN} max={MIXER_VOLUME_MAX} step={0.1} value={channel.volumeDb}
                    aria-label={`${title} ${qtrc('playback', 'Volume')}`} aria-orientation="vertical" title={`${formatDb(channel.volumeDb)} dB`}
                    onChange={(e) => setChannel(channel.key, { volumeDb: Number(e.currentTarget.value) })}
                    onDoubleClick={() => setChannel(channel.key, { volumeDb: 0 })} />
            </div>
        )
    case 'muteSolo':
        if (channel.type === 'master' || channel.type === 'metronome') {
            return <div className="mixer-cell" />
        }
        return (
            <div className="mixer-cell mixer-mute-solo">
                <button className={`mixer-toggle mute${channel.mute || channel.forceMute ? ' on' : ''}`} disabled={channel.forceMute}
                    aria-pressed={channel.mute || channel.forceMute} aria-label={`${title} ${qtrc('playback', 'Mute')}`} title={qtrc('playback', 'Mute')}
                    onClick={() => setChannel(channel.key, { mute: !channel.mute })}>
                    {String.fromCodePoint(ICON_CODES.MUTE)}
                </button>
                <button className={`mixer-toggle solo${channel.solo ? ' on' : ''}`} aria-pressed={channel.solo}
                    aria-label={`${title} ${qtrc('playback', 'Solo')}`} title={qtrc('playback', 'Solo')}
                    onClick={() => setChannel(channel.key, { solo: !channel.solo })}>
                    {String.fromCodePoint(ICON_CODES.SOLO)}
                </button>
            </div>
        )
    case 'name':
        return <div className="mixer-cell mixer-name" title={title}>{title}</div>
    }
}

const ROWS = [
    { row: 'pan', header: ['playback', 'Pan'] },
    { row: 'volume', header: ['playback', 'Volume'] },
    { row: 'fader', header: null },
    { row: 'muteSolo', header: null },
    { row: 'name', header: ['playback', 'Name'] },
] as const

function Splitter({ height }: { height: number }): React.JSX.Element {
    const drag = useRef<{ id: number; y: number; height: number } | null>(null)
    const end = (e: React.PointerEvent<HTMLDivElement>): void => {
        drag.current = null
        e.currentTarget.classList.remove('dragging')
    }
    return (
        <div className="mixer-splitter" role="separator" aria-orientation="horizontal" tabIndex={0}
            aria-valuenow={height} aria-valuemin={MIXER_MIN_HEIGHT} aria-valuemax={MIXER_MAX_HEIGHT}
            onPointerDown={(e) => {
                drag.current = { id: e.pointerId, y: e.clientY, height }
                e.currentTarget.setPointerCapture(e.pointerId)
                e.currentTarget.classList.add('dragging')
            }}
            onPointerMove={(e) => {
                const d = drag.current
                if (d && d.id === e.pointerId) {
                    setMixerHeight(d.height + d.y - e.clientY)
                }
            }}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => {
                const step = e.shiftKey ? 50 : 10
                const h = e.key === 'ArrowUp' ? height + step : e.key === 'ArrowDown' ? height - step : null
                if (h !== null) {
                    e.preventDefault()
                    e.stopPropagation()
                    setMixerHeight(h)
                }
            }} />
    )
}

export function MixerPanel(): React.JSX.Element | null {
    useLanguage()
    useScoreView() // another score
    const score = masterScore()
    useMixerVersion(score)
    if (!settings().mixer.open || !score) {
        return null
    }
    const channels = mixerChannels(score, { playChordSymbols: settings().playback.playChordSymbols })
    const height = settings().mixer.height
    const title = qtrc('appshell', 'Mixer')
    return (
        <section className="mixer-panel" style={{ height }} aria-label={title}
            onKeyDown={(e) => {
                // the score's shortcuts do not act on the mixer's controls
                if (e.target instanceof HTMLInputElement) {
                    e.stopPropagation()
                }
            }}>
            <Splitter height={height} />
            <div className="mixer-titlebar">
                <span className="mixer-title">{title}</span>
                <button className="icon mixer-close" aria-label={qtrc('appshell/dock', 'Close')} title={qtrc('appshell/dock', 'Close')}
                    onClick={() => setMixerOpen(false)}>
                    {String.fromCodePoint(ICON_CODES.CLOSE_X_ROUNDED)}
                </button>
            </div>
            <div className="mixer-scroll">
                <div className="mixer-grid" style={{ gridTemplateColumns: `98px repeat(${channels.length}, 108px)` }}>
                    {ROWS.map(({ row, header }) => [
                        <div key={`h-${row}`} className={`mixer-header mixer-row-${row}`}>{header ? qtrc(header[0], header[1]) : ''}</div>,
                        ...channels.map(c => (
                            <div key={`${row}-${c.key}`} className={`mixer-strip mixer-row-${row}${c.type === 'master' ? ' master' : ''}`}>
                                <Strip channel={c} row={row} />
                            </div>
                        )),
                    ])}
                </div>
            </div>
        </section>
    )
}
