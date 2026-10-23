/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/soundflag.h/.cpp
 *
 * A sound flag holds playback data of a staff text (sound presets, playing technique); it is never printed.
 * TODO(port): the icon in the notation view (the engraving library has no icon font: iconsFontFamily() is empty, so
 * shouldHide() is always true like in C++ without an icon font), undoChangeSoundFlag (ChangeSoundFlag), playback.
 */

import { Color } from '../../framework/draw/types/color'
import { Font, FontType } from '../../framework/draw/types/font'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType } from '../types/types'
import { EngravingItem } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'

/** C++ UI_ICONS_DEFAULT_FONT_SIZE */
const UI_ICONS_DEFAULT_FONT_SIZE = 12

export class SoundFlag extends EngravingItem {
    private m_soundPresets: string[] = []
    private m_playingTechnique = ''

    private m_iconFont: Font
    private m_iconFontValid = false

    private m_play = true
    private m_applyToAllStaves = true

    constructor(parent: EngravingObject | null) {
        super(ElementType.SOUND_FLAG, parent)
        // C++ configuration()->iconsFontFamily(): not available in the engraving library
        const fontFamily = ''
        this.m_iconFontValid = fontFamily.length > 0
        this.m_iconFont = new Font(fontFamily, FontType.Icon)
        this.m_iconFont.setPointSizeF(UI_ICONS_DEFAULT_FONT_SIZE)

        //! draw on top of all elements
        this.setZ(0x7fffffff)
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_soundPresets = [...original.m_soundPresets]
        this.m_iconFont = original.m_iconFont.clone()
    }

    override isEditable(): boolean { return false }

    override setSelected(f: boolean): void {
        const parent = this.parentItem()
        if (parent) {
            parent.setSelected(f)
        }

        super.setSelected(f)
    }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.PLAY:
            return this.m_play
        case Pid.VISIBLE:
        case Pid.AUTOPLACE:
        case Pid.SMALL:
            return undefined
        case Pid.APPLY_TO_ALL_STAVES:
            return this.m_applyToAllStaves
        default:
            return super.getProperty(id)
        }
    }

    override setProperty(id: Pid, value: PropertyValue): boolean {
        switch (id) {
        case Pid.PLAY:
            this.m_play = value as boolean
            return true
        case Pid.VISIBLE:
        case Pid.AUTOPLACE:
        case Pid.SMALL:
            return false
        case Pid.APPLY_TO_ALL_STAVES:
            this.m_applyToAllStaves = value as boolean
            return true
        default:
            return super.setProperty(id, value)
        }
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.PLAY:
            return true
        case Pid.VISIBLE:
        case Pid.AUTOPLACE:
        case Pid.SMALL:
            return undefined
        case Pid.APPLY_TO_ALL_STAVES:
            return true
        default:
            return super.propertyDefault(id)
        }
    }

    override canBeExcludedFromOtherParts(): boolean { return false }

    soundPresets(): string[] { return this.m_soundPresets }
    setSoundPresets(soundPresets: string[]): void { this.m_soundPresets = [...soundPresets] }

    playingTechnique(): string { return this.m_playingTechnique }
    setPlayingTechnique(technique: string): void { this.m_playingTechnique = technique }

    play(): boolean { return this.m_play }
    setPlay(play: boolean): void { this.m_play = play }

    applyToAllStaves(): boolean { return this.m_applyToAllStaves }
    setApplyToAllStaves(apply: boolean): void { this.m_applyToAllStaves = apply }

    clear(): void {
        if (!this.m_soundPresets.length && !this.m_playingTechnique) {
            return
        }

        this.m_soundPresets = []
        this.m_playingTechnique = ''

        this.triggerLayout()
    }

    shouldHide(): boolean {
        if (!this.m_iconFontValid) {
            return true
        }

        const score = this.score()
        if (score) {
            if (!score.showSoundFlags()) {
                return true
            }

            if (score.printing()) {
                return true
            }
        }

        if (this.m_soundPresets.length || this.m_playingTechnique) {
            return false
        }

        if (this.selected()) {
            return false
        }

        const parent = this.parentItem()
        if (parent && parent.selected() && this.score().selection().isSingle()) {
            return false
        }

        return true
    }

    iconCode(): number { return 0xEF4E }

    iconFont(): Font {
        const font = this.m_iconFont.clone()
        font.setPointSizeF(UI_ICONS_DEFAULT_FONT_SIZE * this.magS())
        return font
    }

    iconBackgroundColor(): Color {
        let color = this.curColor()
        if (!this.selected()) {
            color = Color.fromString('#CFD5DD')
            color.setAlpha(128)
        }

        return color
    }
}
