/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The mixer panel of the MuseEncore Viewer (MuseScore: playback/qml/MuseScore/Playback/MixerPanel.qml with its
 * sections internal/Mixer*Section.qml): a strip per track with pan, volume, fader, mute and solo, and the name; the
 * master last (no mute and solo). Not ported: the sound, audio FX and aux send sections. The viewer cannot save the
 * score, so the changes last while the score is open (the library's mixer, src/playback/mixer.ts; ViewerPlayback
 * applies it to the sound). The viewer has no metronome: no metronome strip.
 */
import {
    BALANCE_SCALING_FACTOR, MIXER_VOLUME_MAX, MIXER_VOLUME_MIN, mixerChannels, onMixerChanged, setMixerChannel,
    type MasterScore, type MixerChannel,
} from '../../src/index'

// MuseScore's icon codes (src/framework/ui/view/iconcodes.h)
const MUTE_ICON = '&#xF3D5;'
const SOLO_ICON = '&#xF3D6;'
const CLOSE_ICON = '&#xEF14;'

/** the controls of a strip */
interface Strip {
    key: string
    el: HTMLDivElement
    pan: HTMLInputElement
    panValue: HTMLInputElement
    volume: HTMLInputElement
    fader: HTMLInputElement
    mute: HTMLButtonElement | null
    solo: HTMLButtonElement | null
    name: HTMLDivElement
}

/** dB with one decimal (MixerVolumeSection.qml: Math.round(volumeLevel * 10) / 10) */
function formatDb(db: number): string {
    return String(Math.round(db * 10) / 10)
}

export class ViewerMixer {
    readonly element: HTMLElement
    private readonly m_body: HTMLDivElement
    private m_score: MasterScore | null = null
    private m_strips: Strip[] = []
    private m_removeListener: (() => void) | null = null
    /** the number field being typed in (it keeps what is typed until it is committed) */
    private m_editing: HTMLInputElement | null = null

    /** onClose: the close button of the panel */
    constructor(onClose: () => void) {
        this.element = document.createElement('section')
        this.element.className = 'mixer'
        this.element.id = 'mixer'
        this.element.setAttribute('aria-label', 'Mixer')
        this.element.hidden = true
        this.element.innerHTML = `
<div class="mixer-titlebar">
    <span class="mixer-title">Mixer</span>
    <button class="icon mixer-close" title="Close" aria-label="Close">${CLOSE_ICON}</button>
</div>
<div class="mixer-scroll">
    <div class="mixer-strips">
        <div class="mixer-strip mixer-header" aria-hidden="true">
            <div class="mixer-cell">Pan</div>
            <div class="mixer-cell">Volume</div>
            <div class="mixer-cell mixer-fader-cell"></div>
            <div class="mixer-cell"></div>
            <div class="mixer-cell">Name</div>
        </div>
    </div>
</div>`
        this.m_body = this.element.querySelector('.mixer-strips')!
        this.element.querySelector<HTMLButtonElement>('.mixer-close')!.addEventListener('click', onClose)
    }

    isShown(): boolean {
        return !this.element.hidden
    }

    setShown(shown: boolean): void {
        this.element.hidden = !shown
        if (shown) {
            this.rebuild()
        }
    }

    setScore(score: MasterScore | null): void {
        if (score === this.m_score) {
            return
        }
        this.m_removeListener?.()
        this.m_score = score
        this.m_removeListener = score ? onMixerChanged(score, () => this.update()) : null
        this.rebuild()
    }

    dispose(): void {
        this.m_removeListener?.()
        this.m_removeListener = null
        this.m_score = null
    }

    private channels(): MixerChannel[] {
        return this.m_score ? mixerChannels(this.m_score).filter(c => c.type !== 'metronome') : []
    }

    private set(key: string, values: Parameters<typeof setMixerChannel>[2]): void {
        if (this.m_score) {
            setMixerChannel(this.m_score, key, values)
        }
    }

    /** builds the strips (a new score, the panel is shown) */
    private rebuild(): void {
        for (const s of this.m_strips) {
            s.el.remove()
        }
        this.m_strips = []
        if (!this.m_score || this.element.hidden) {
            return
        }
        for (const c of this.channels()) {
            const strip = this.createStrip(c)
            this.m_strips.push(strip)
            this.m_body.appendChild(strip.el)
        }
        this.update()
    }

    private createStrip(c: MixerChannel): Strip {
        const el = document.createElement('div')
        el.className = 'mixer-strip' + (c.type === 'master' ? ' master' : '')
        el.setAttribute('role', 'group')
        el.dataset.key = c.key

        const cell = (cls = ''): HTMLDivElement => {
            const d = el.appendChild(document.createElement('div'))
            d.className = 'mixer-cell' + (cls ? ` ${cls}` : '')
            return d
        }
        const input = (parent: HTMLElement, attrs: Record<string, string>): HTMLInputElement => {
            const i = parent.appendChild(document.createElement('input'))
            for (const [k, v] of Object.entries(attrs)) {
                i.setAttribute(k, v)
            }
            if (attrs.type === 'number') {
                i.addEventListener('input', () => { this.m_editing = i })
                i.addEventListener('blur', () => {
                    if (this.m_editing === i) {
                        this.m_editing = null
                        this.update()
                    }
                })
            }
            return i
        }

        // Pan (MixerBalanceSection.qml: the knob and its number field, -100 .. 100)
        const panCell = cell('mixer-pan')
        const pan = input(panCell, { type: 'range', min: '-100', max: '100', step: '1', class: 'mixer-pan-slider' })
        const panValue = input(panCell, { type: 'number', min: '-100', max: '100', step: '1', class: 'mixer-number mixer-pan-value' })
        pan.title = 'Double-click: center'
        pan.addEventListener('input', () => this.set(c.key, { balance: Number(pan.value) / BALANCE_SCALING_FACTOR }))
        pan.addEventListener('dblclick', () => this.set(c.key, { balance: 0 }))
        panValue.addEventListener('change', () => {
            this.m_editing = null
            const v = Math.round(Number(panValue.value))
            if (Number.isFinite(v)) {
                this.set(c.key, { balance: v / BALANCE_SCALING_FACTOR })
            }
            this.update()
        })

        // Volume (MixerVolumeSection.qml: dB with one decimal)
        const volume = input(cell(), { type: 'number', min: String(MIXER_VOLUME_MIN), max: String(MIXER_VOLUME_MAX), step: '0.1', class: 'mixer-number mixer-volume' })
        volume.addEventListener('change', () => {
            this.m_editing = null
            const v = Number(volume.value)
            if (volume.value !== '' && Number.isFinite(v)) {
                this.set(c.key, { volumeDb: Math.round(v * 10) / 10 })
            }
            this.update()
        })

        // Fader (MixerFaderSection.qml, VolumeSlider.qml: -60 .. 12 dB)
        const fader = input(cell('mixer-fader-cell'), {
            type: 'range', min: String(MIXER_VOLUME_MIN), max: String(MIXER_VOLUME_MAX), step: '0.1', class: 'mixer-fader', 'aria-orientation': 'vertical',
        })
        fader.title = 'Double-click: 0 dB'
        fader.addEventListener('input', () => this.set(c.key, { volumeDb: Number(fader.value) }))
        fader.addEventListener('dblclick', () => this.set(c.key, { volumeDb: 0 }))

        // Mute and solo (MixerMuteAndSoloSection.qml); the master has none
        const muteCell = cell('mixer-mute-solo')
        let mute: HTMLButtonElement | null = null
        let solo: HTMLButtonElement | null = null
        if (c.type !== 'master') {
            mute = muteCell.appendChild(document.createElement('button'))
            mute.className = 'icon toggle mixer-mute'
            mute.innerHTML = MUTE_ICON
            mute.title = 'Mute'
            mute.addEventListener('click', () => this.set(c.key, { mute: mute!.getAttribute('aria-pressed') !== 'true' }))
            solo = muteCell.appendChild(document.createElement('button'))
            solo.className = 'icon toggle mixer-solo'
            solo.innerHTML = SOLO_ICON
            solo.title = 'Solo'
            solo.addEventListener('click', () => this.set(c.key, { solo: solo!.getAttribute('aria-pressed') !== 'true' }))
        }

        // Name (MixerTitleSection.qml)
        const name = cell('mixer-name')

        return { key: c.key, el, pan, panValue, volume, fader, mute, solo, name }
    }

    /** the values of the strips, in place (a fader being dragged keeps working) */
    private update(): void {
        if (!this.m_score || this.element.hidden) {
            return
        }
        const channels = this.channels()
        if (channels.length !== this.m_strips.length || channels.some((c, i) => c.key !== this.m_strips[i].key)) {
            this.rebuild() // the parts changed
            return
        }
        channels.forEach((c, i) => {
            const s = this.m_strips[i]
            const balance = Math.round(c.balance * BALANCE_SCALING_FACTOR)
            const db = Math.round(c.volumeDb * 10) / 10
            s.el.setAttribute('aria-label', c.title)
            s.name.textContent = c.title
            s.name.title = c.title
            s.pan.value = String(balance)
            s.pan.setAttribute('aria-label', `${c.title} Pan`)
            s.panValue.setAttribute('aria-label', `${c.title} Pan ${balance}`)
            s.fader.value = String(db)
            s.fader.setAttribute('aria-label', `${c.title} Volume`)
            s.fader.setAttribute('aria-valuetext', `${formatDb(db)} dB`)
            s.volume.setAttribute('aria-label', `${c.title} Volume ${formatDb(db)}`)
            // a field being edited keeps what is typed
            if (s.panValue !== this.m_editing) {
                s.panValue.value = String(balance)
            }
            if (s.volume !== this.m_editing) {
                s.volume.value = formatDb(db)
            }
            if (s.mute && s.solo) {
                const muted = c.mute || c.forceMute
                s.mute.setAttribute('aria-pressed', String(muted))
                s.mute.setAttribute('aria-label', `${c.title} Mute`)
                // MixerMuteAndSoloSection.qml: disabled while it is muted by the solo of another track
                s.mute.disabled = muted && c.forceMute
                s.solo.setAttribute('aria-pressed', String(c.solo))
                s.solo.setAttribute('aria-label', `${c.title} Solo`)
                s.solo.disabled = c.mute && !c.forceMute
            }
        })
    }
}
