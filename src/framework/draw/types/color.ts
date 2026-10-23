/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/draw/types/color.h
 */

export class Color {
    static readonly DEFAULT_ALPHA = 255

    constructor(public r = -1, public g = -1, public b = -1, public a = Color.DEFAULT_ALPHA) {}

    static fromRgb(r: number, g: number, b: number, a = 255): Color { return new Color(r, g, b, a) }

    /** Accepts "#rrggbb", "#aarrggbb" (Qt style) */
    static fromString(s: string): Color {
        if (!s || s[0] !== '#') {
            return new Color()
        }
        const hex = s.slice(1)
        if (hex.length === 6) {
            return new Color(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16))
        }
        if (hex.length === 8) {
            return new Color(parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), parseInt(hex.slice(6, 8), 16),
                parseInt(hex.slice(0, 2), 16))
        }
        return new Color()
    }

    clone(): Color { return new Color(this.r, this.g, this.b, this.a) }

    isValid(): boolean { return this.r >= 0 && this.g >= 0 && this.b >= 0 && this.a >= 0 }

    red(): number { return this.r }
    green(): number { return this.g }
    blue(): number { return this.b }
    alpha(): number { return this.a }
    setRed(v: number): void { this.r = v }
    setGreen(v: number): void { this.g = v }
    setBlue(v: number): void { this.b = v }
    setAlpha(v: number): void { this.a = v }

    equals(o: Color): boolean { return this.r === o.r && this.g === o.g && this.b === o.b && this.a === o.a }

    /** tint between 0 and 1: higher means lighter, lower means darker */
    applyTint(tint: number): void {
        // C++ setRgba(int, ...): the double values are truncated
        this.r = Math.trunc(this.r + (255 - this.r) * tint)
        this.g = Math.trunc(this.g + (255 - this.g) * tint)
        this.b = Math.trunc(this.b + (255 - this.b) * tint)
    }

    inverted(): Color { return new Color(255 - this.r, 255 - this.g, 255 - this.b, this.a) }

    /** "#rrggbb" */
    toString(): string {
        const h = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
        return `#${h(this.r)}${h(this.g)}${h(this.b)}`
    }

    toCss(): string {
        if (this.a >= 255) {
            return this.toString()
        }
        return `rgba(${this.r},${this.g},${this.b},${this.a / 255})`
    }

    static readonly BLACK = new Color(0, 0, 0)
    static readonly WHITE = new Color(255, 255, 255)
    static readonly RED = new Color(255, 0, 0)
    static readonly GREEN = new Color(0, 255, 0)
    static readonly BLUE = new Color(0, 0, 255)
    static readonly transparent = new Color(255, 255, 255, 0)
}
