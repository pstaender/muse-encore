/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/style/defaultstyle.h/.cpp
 */

import { MStyle } from './style'

let s_baseStyle: MStyle | null = null
let s_defaultStyle: MStyle | null = null
const s_legacyStyles = new Map<number, MStyle>()
const s_legacyStyleData = new Map<number, string>()

export class DefaultStyle {
    /** the built-in defaults of styledef */
    static baseStyle(): MStyle {
        if (!s_baseStyle) {
            s_baseStyle = new MStyle()
            s_baseStyle.precomputeValues()
        }
        return s_baseStyle
    }

    /** base style + user defined default style (not supported, same as base) */
    static defaultStyle(): MStyle {
        if (!s_defaultStyle) {
            s_defaultStyle = DefaultStyle.baseStyle().clone()
            s_defaultStyle.precomputeValues()
        }
        return s_defaultStyle
    }

    /**
     * Registers the content of a legacy-style-defaults-*.mss file
     * (versions 114, 206, 301, 302, 450), needed to open older scores.
     */
    static registerLegacyStyle(defaultsVersion: number, mssContent: string): void {
        s_legacyStyleData.set(defaultsVersion, mssContent)
        s_legacyStyles.delete(defaultsVersion)
    }

    static resolveStyleDefaults(defaultsVersion: number): MStyle {
        const cached = s_legacyStyles.get(defaultsVersion)
        if (cached) {
            return cached
        }
        const data = s_legacyStyleData.get(defaultsVersion)
        if (!data) {
            return DefaultStyle.baseStyle()
        }
        const style = new MStyle()
        style.readDocument(data)
        style.precomputeValues()
        s_legacyStyles.set(defaultsVersion, style)
        return style
    }
}
