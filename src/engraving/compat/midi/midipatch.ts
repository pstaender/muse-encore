/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/compat/midi/midipatch.h
 */

export interface MidiPatch {
    drum: boolean
    synti: string
    bank: number
    prog: number
    sfid: number
    name: string
}
