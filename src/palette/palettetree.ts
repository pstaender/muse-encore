/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/palette/internal/palettetree.h/.cpp
 *
 * TODO(port): reading/writing (PaletteBox)
 */

import type { Palette } from './palette'

export class PaletteTree {
    palettes: Palette[] = []

    insert(idx: number, palette: Palette): void {
        this.palettes.splice(idx, 0, palette)
    }

    append(palette: Palette): void {
        this.palettes.push(palette)
    }

    retranslate(): void {
        for (const palette of this.palettes) {
            palette.retranslate()
        }
    }
}
