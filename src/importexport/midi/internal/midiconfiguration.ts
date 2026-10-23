/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the import part of src/importexport/midi/internal/midiconfiguration.h/.cpp: the settings io/midi/shortestNote
 * and io/midi/roundTempo (Preferences > Import > MIDI) with MuseScore's defaults. The export settings are passed to the
 * MIDI writer (ExportConfiguration.midi).
 */

import { Constants } from '../../../engraving/types/constants'

/** the import settings (C++ settings keys io/midi/shortestNote, io/midi/roundTempo) */
export interface MidiImportSettings {
    /** io/midi/shortestNote: the shortest note in ticks (quantization) */
    midiShortestNote: number
    /** io/midi/roundTempo: round tempos to the nearest whole number */
    roundTempo: boolean
}

/** MidiConfiguration::init(): the default values */
export function defaultMidiImportSettings(): MidiImportSettings {
    return { midiShortestNote: Constants.DIVISION / 4, roundTempo: true }
}

export class MidiConfiguration {
    private m_settings: MidiImportSettings

    constructor(settings: Partial<MidiImportSettings> = {}) {
        this.m_settings = { ...defaultMidiImportSettings(), ...settings }
    }

    settings(): MidiImportSettings { return { ...this.m_settings } }
    setSettings(settings: Partial<MidiImportSettings>): void { this.m_settings = { ...this.m_settings, ...settings } }

    midiShortestNote(): number { return this.m_settings.midiShortestNote }
    setMidiShortestNote(ticks: number): void { this.m_settings.midiShortestNote = ticks }

    roundTempo(): boolean { return this.m_settings.roundTempo }
    setRoundTempo(round: boolean): void { this.m_settings.roundTempo = round }
}

const s_configuration = new MidiConfiguration()

/** the configuration the MIDI import uses (C++ the IMidiImportExportConfiguration from the IoC container) */
export function midiImportConfiguration(): MidiConfiguration {
    return s_configuration
}
