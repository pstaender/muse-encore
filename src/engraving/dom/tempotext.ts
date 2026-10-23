/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/tempotext.h/.cpp
 *
 * TODO(port): accessibility (tempoInfo), tpSym/duration2tempoTextString
 */

import type { PropertyValue } from '../types/propertyvalue'
import { Fraction } from '../types/fraction'
import type { PropertyFlags } from './property'
import { Constants } from '../types/constants'
import { ElementType, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Measure } from './measure'
import type { Segment } from './segment'
import { TextBase } from './textbase'

export enum TempoTextType {
    NORMAL,
    A_TEMPO,
    TEMPO_PRIMO,
}

const MIN_TEMPO = 5.0 / 60
const MAX_TEMPO = 999.0 / 60

/** C++ TempoPattern: pattern (regex source on the plain text), factor; the longer patterns are before the shorter ones */
const tp: readonly (readonly [string, number])[] = [
    ['\uECA5\\s*\uECB7\\s*\uECB7', 1.75 / 60.0], // double dotted 1/4
    ['\uECA5\\s*\uECB7', 1.5 / 60.0], // dotted 1/4
    ['\uECA5', 1.0 / 60.0], // 1/4
    ['\uECA3\\s*\uECB7\\s*\uECB7', 1.75 / 30.0], // double dotted 1/2
    ['\uECA3\\s*\uECB7', 1.5 / 30.0], // dotted 1/2
    ['\uECA3', 1.0 / 30.0], // 1/2
    ['\uECA7\\s*\uECB7\\s*\uECB7', 1.75 / 120.0], // double dotted 1/8
    ['\uECA7\\s*\uECB7', 1.5 / 120.0], // dotted 1/8
    ['\uECA7', 1.0 / 120.0], // 1/8
    ['\uECA2\\s*\uECB7', 1.5 / 15.0], // dotted whole
    ['\uECA2', 1.0 / 15.0], // whole
    ['\uECA9\\s*\uECB7', 1.5 / 240.0], // dotted 1/16
    ['\uECA9', 1.0 / 240.0], // 1/16
    ['\uECAB\\s*\uECB7', 1.5 / 480.0], // dotted 1/32
    ['\uECAB', 1.0 / 480.0], // 1/32
    ['\uECA1', 1.0 / 7.5], // longa
    ['\uECA0', 1.0 / 7.5], // double whole
    ['\uECAD', 1.0 / 960.0], // 1/64
    ['\uECAF', 1.0 / 1920.0], // 1/128
    ['\uECB1', 1.0 / 3840.0], // 1/256
    ['\uECB3', 1.0 / 7680.0], // 1/512
    ['\uECB5', 1.0 / 15360.0], // 1/1024
]

const regexps = new Map<string, RegExp>()
const regexps2 = new Map<string, RegExp>()

const tempoStyle: ElementStyle = [
    { sid: Sid.tempoSystemFlag, pid: Pid.SYSTEM_FLAG },
    { sid: Sid.tempoPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.tempoMinDistance, pid: Pid.MIN_DISTANCE },
]

export class TempoText extends TextBase {
    static readonly DEFAULT_SYM_SIZE_RATIO = 5.0 / 3.0

    private m_tempoTextType = TempoTextType.NORMAL
    private m_tempo: number = Constants.DEFAULT_TEMPO // beats per second
    private m_followText = false
    private m_playTempoText = true
    private m_relative = 1.0
    private m_isRelative = false
    private m_alignRightOfRehearsalMark = true

    constructor(parent: EngravingObject | null) {
        super(ElementType.TEMPO_TEXT, parent, TextStyleType.TEMPO, ElementFlag.SYSTEM | ElementFlag.ON_STAFF)
        this.initElementStyle(tempoStyle)
        this.resetProperty(Pid.MUSIC_SYMBOL_SIZE)
    }

    segment(): Segment { return this.explicitParent() as unknown as Segment }
    measure(): Measure { return this.explicitParent()!.explicitParent() as unknown as Measure }

    tempoTextType(): TempoTextType { return this.m_tempoTextType }
    setTempoTextType(ttt: TempoTextType): void {
        this.m_tempoTextType = ttt
        this.score()?.setUpTempoMapLater()
    }
    isNormal(): boolean { return this.m_tempoTextType === TempoTextType.NORMAL }
    isATempo(): boolean { return this.m_tempoTextType === TempoTextType.A_TEMPO }
    isTempoPrimo(): boolean { return this.m_tempoTextType === TempoTextType.TEMPO_PRIMO }
    tempo(): number { return this.m_tempo }
    setTempo(v: number): void {
        if (v < MIN_TEMPO) {
            v = MIN_TEMPO
        } else if (v > MAX_TEMPO) {
            v = MAX_TEMPO
        }
        this.m_tempo = v
    }
    tempoBpm(): number { return this.m_tempo * 60.0 }
    isRelative(): boolean { return this.m_isRelative }
    setRelative(v: number): void { this.m_isRelative = true; this.m_relative = v }
    playTempoText(): boolean { return this.m_playTempoText }
    setPlayTempoText(v: boolean): void { this.m_playTempoText = v }
    followText(): boolean { return this.m_followText }
    setFollowText(v: boolean): void { this.m_followText = v }
    alignRightOfRehearsalMark(): boolean { return this.m_alignRightOfRehearsalMark }

    override positionRelativeToNoteheadRest(): boolean { return true }

    updateScore(): void {
        this.score().setUpTempoMapLater()
        this.score().masterScore().setPlaylistDirty()
    }

    updateRelative(): void {
        const tempoBefore = this.score().tempo(this.tick().minus(Fraction.eps()))
        this.setTempo(tempoBefore * this.m_relative)
    }

    override undoChangeProperty(id: Pid, v: PropertyValue, ps: PropertyFlags = this.propertyFlags(id)): void {
        super.undoChangeProperty(id, v, ps)
        if (id === Pid.TEMPO_FOLLOW_TEXT && this.m_followText) {
            this.updateTempo()
        }
    }

    /** C++ TempoText::updateTempo: the tempo from the text (followText) */
    updateTempo(): void {
        let s = this.plainText()
        s = s.replaceAll(',', '.')
        s = s.replaceAll('<sym>space</sym>', ' ')
        s = s.replaceAll('≒', '=')
        s = s.replaceAll('≈', '=')
        s = s.replaceAll('~', '=')
        s = s.replaceAll('ca.', '')
        s = s.replaceAll('c.', '')
        s = s.replaceAll('approx.', '')

        for (const [pattern, f] of tp) {
            let re = regexps.get(pattern)
            if (!re) {
                re = new RegExp(`${pattern}\\s*=\\s*(\\d+[.]{0,1}\\d*)\\s*`, 'u')
                regexps.set(pattern, re)
            }
            const match = re.exec(s)
            if (match) {
                const nt = parseFloat(match[1]) * f
                if (nt !== this.m_tempo) {
                    this.undoChangeProperty(Pid.TEMPO, nt, this.propertyFlags(Pid.TEMPO))
                    this.m_relative = 1.0
                    this.m_isRelative = false
                    this.updateScore()
                }
                break
            } else {
                for (const [pattern2, f2] of tp) {
                    const key = `${pattern}_${pattern2}`
                    let re2 = regexps2.get(key)
                    if (!re2) {
                        re2 = new RegExp(`${pattern}\\s*=\\s*${pattern2}\\s*`, 'u')
                        regexps2.set(key, re2)
                    }
                    if (re2.exec(s)) {
                        this.m_relative = f2 / f
                        this.m_isRelative = true
                        this.updateRelative()
                        this.updateScore()
                        return
                    }
                }
            }
        }
    }

    override added(): void { this.updateScore() }
    override removed(): void { this.updateScore() }

    override commitText(): void {
        if (this.m_followText) {
            this.updateTempo()
        }

        super.commitText()
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.PLAY: return this.m_playTempoText
        case Pid.TEMPO: return this.m_tempo
        case Pid.TEMPO_FOLLOW_TEXT: return this.m_followText
        case Pid.TEMPO_ALIGN_RIGHT_OF_REHEARSAL_MARK: return this.m_alignRightOfRehearsalMark
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.PLAY:
            this.setPlayTempoText(v as boolean)
            this.score().setUpTempoMapLater()
            break
        case Pid.TEMPO:
            this.setTempo(v as number)
            this.score().setUpTempoMapLater()
            break
        case Pid.TEMPO_FOLLOW_TEXT:
            this.setFollowText(v as boolean)
            break
        case Pid.TEMPO_ALIGN_RIGHT_OF_REHEARSAL_MARK:
            this.m_alignRightOfRehearsalMark = v as boolean
            break
        default:
            if (!super.setProperty(propertyId, v)) {
                return false
            }
            break
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.PLAY: return true
        case Pid.TEXT_STYLE: return TextStyleType.TEMPO
        case Pid.TEMPO: return 2.0
        case Pid.TEMPO_FOLLOW_TEXT: return false
        case Pid.TEMPO_ALIGN_RIGHT_OF_REHEARSAL_MARK: return true
        default: return super.propertyDefault(id)
        }
    }
}
