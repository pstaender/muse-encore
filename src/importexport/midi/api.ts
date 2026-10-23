/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * The public API of the MIDI export (File > Export > MIDI file).
 */

import type { Score } from '../../engraving/dom/score'
import { MIDI_EXPORT_CONFIGURATION_DEFAULTS, NotationMidiWriter } from './internal/notationmidiwriter'

/** the options of MuseScore's MIDI export (MidiSettingsPage.qml; defaults of MidiConfiguration: both true) */
export interface MidiExportOptions {
    /** "Expand repeats" (io/midi/expandRepeats) */
    expandRepeats: boolean
    /** "Export RPNs" (io/midi/exportRPNs): pitch bend sensitivity and portamento controllers */
    exportRPNs: boolean
}

/** a Standard MIDI File (format 1, a track per staff) of the score: the master score or a part (excerpt) score */
export function writeMidi(score: Score, options?: Partial<MidiExportOptions>): Uint8Array {
    return new NotationMidiWriter().write(score, {
        expandRepeats: options?.expandRepeats ?? MIDI_EXPORT_CONFIGURATION_DEFAULTS.expandRepeats,
        exportRPNs: options?.exportRPNs ?? MIDI_EXPORT_CONFIGURATION_DEFAULTS.exportRPNs,
    })
}
