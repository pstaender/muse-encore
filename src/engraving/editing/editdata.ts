/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the Grip enum of src/engraving/editing/editdata.h (EditData itself is not ported)
 */

export enum Grip {
    NO_GRIP = -1,
    START = 0, END = 1, // arpeggio etc.
    LEFT = START, RIGHT = END, // aliases for dynamic
    MIDDLE = 2, APERTURE = 3, // Line
    BEZIER1 = 2, SHOULDER = 3, BEZIER2 = 4, DRAG = 5, // Slur
    GRIPS = 6, // number of grips for slur
}
