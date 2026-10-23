/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/notationmidiwriter.h/.cpp and the export settings of midiconfiguration.cpp
 * The notation is its score; the settings of the MIDI configuration ("io/midi/expandRepeats", "io/midi/exportRPNs")
 * are passed in. write() returns the bytes of the file.
 * TODO(port): INotationWriter (unit types, writeList), the settings storage of MidiConfiguration
 */

import type { Score } from '../../../engraving/dom/score'
import { ExportMidi } from './midiexport/exportmidi'

/** IMidiImportExportConfiguration: the settings of the MIDI export */
export interface MidiExportConfiguration {
    /** isExpandRepeats() */
    expandRepeats: boolean
    /** isMidiExportRpns() */
    exportRPNs: boolean
}

/** MidiConfiguration::init(): the default values */
export const MIDI_EXPORT_CONFIGURATION_DEFAULTS: Readonly<MidiExportConfiguration> = {
    expandRepeats: true,
    exportRPNs: true,
}

export class NotationMidiWriter {
    write(score: Score, midiImportExportConfiguration: MidiExportConfiguration = MIDI_EXPORT_CONFIGURATION_DEFAULTS): Uint8Array {
        const exportMidi = new ExportMidi(score)

        const isPlayRepeatsEnabled = midiImportExportConfiguration.expandRepeats
        const isMidiExportRpns = midiImportExportConfiguration.exportRPNs
        const synthesizerState = score.synthesizerState()

        return exportMidi.write(isPlayRepeatsEnabled, isMidiExportRpns, synthesizerState)
    }
}
