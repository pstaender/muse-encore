/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/draw/types/font.h
 */

export enum FontType {
    Undefined = 0,
    Unknown,
    Icon,
    Text,
    MusicSymbolText,
    MusicSymbol,
    Tablature,
    Harmony,
}

export enum FontHinting {
    PreferDefaultHinting = 0,
    PreferNoHinting = 1,
    PreferVerticalHinting = 2,
    PreferFullHinting = 3,
}

export enum FontWeight {
    Thin = 0,
    ExtraLight = 12,
    Light = 25,
    Normal = 50,
    Medium = 57,
    DemiBold = 63,
    Bold = 75,
    ExtraBold = 81,
    Black = 87,
}

export class Font {
    static readonly Type = FontType
    static readonly Weight = FontWeight

    private m_family = ''
    private m_type: FontType = FontType.Undefined
    private m_pointSizeF = -1.0
    private m_pixelSize = -1
    private m_weight: FontWeight = FontWeight.Normal
    private m_italic = false
    private m_underline = false
    private m_strike = false
    private m_noFontMerging = false
    private m_hinting: FontHinting = FontHinting.PreferDefaultHinting

    constructor(family = '', type: FontType = FontType.Undefined) {
        this.m_family = family
        this.m_type = type
    }

    clone(): Font {
        const f = new Font(this.m_family, this.m_type)
        f.m_pointSizeF = this.m_pointSizeF
        f.m_pixelSize = this.m_pixelSize
        f.m_weight = this.m_weight
        f.m_italic = this.m_italic
        f.m_underline = this.m_underline
        f.m_strike = this.m_strike
        f.m_noFontMerging = this.m_noFontMerging
        f.m_hinting = this.m_hinting
        return f
    }

    setFamily(family: string, type: FontType): void {
        this.m_family = family
        this.m_type = type
    }

    family(): string { return this.m_family }
    type(): FontType { return this.m_type }

    pointSizeF(): number { return this.m_pointSizeF }
    setPointSizeF(s: number): void { this.m_pointSizeF = s; this.m_pixelSize = -1 }

    pixelSize(): number { return this.m_pixelSize }
    setPixelSize(s: number): void { this.m_pixelSize = s; this.m_pointSizeF = -1 }

    weight(): FontWeight { return this.m_weight }
    setWeight(w: FontWeight): void { this.m_weight = w }

    bold(): boolean { return this.m_weight > FontWeight.Medium }
    setBold(arg: boolean): void { this.m_weight = arg ? FontWeight.Bold : FontWeight.Normal }

    italic(): boolean { return this.m_italic }
    setItalic(arg: boolean): void { this.m_italic = arg }

    underline(): boolean { return this.m_underline }
    setUnderline(arg: boolean): void { this.m_underline = arg }

    strike(): boolean { return this.m_strike }
    setStrike(arg: boolean): void { this.m_strike = arg }

    setNoFontMerging(arg: boolean): void { this.m_noFontMerging = arg }
    noFontMerging(): boolean { return this.m_noFontMerging }

    hinting(): FontHinting { return this.m_hinting }
    setHinting(h: FontHinting): void { this.m_hinting = h }

    equals(o: Font): boolean {
        return this.m_family.toLowerCase() === o.m_family.toLowerCase()
               && this.m_type === o.m_type
               && this.m_pointSizeF === o.m_pointSizeF
               && this.m_pixelSize === o.m_pixelSize
               && this.m_weight === o.m_weight
               && this.m_italic === o.m_italic
               && this.m_underline === o.m_underline
               && this.m_strike === o.m_strike
    }
}
