/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_operation.h (namespace MidiOperations: the enums)
 */

// all enums below should have default indexes like 0, 1, 2...
// text names for enum items are in TracksModel class

export enum QuantValue {
    Q_4 = 0,
    Q_8,
    Q_16,
    Q_32,
    Q_64,
    Q_128,
    Q_256,
    Q_512,
    Q_1024,
    Q_INVALID = -1,
}

export enum VoiceCount {
    V_1 = 0,
    V_2,
    V_3,
    V_4,
}

export enum Swing {
    NONE = 0,
    SWING,
    SHUFFLE,
}

export enum TimeSigNumerator {
    _2 = 0,
    _3,
    _4,
    _5,
    _6,
    _7,
    _9,
    _12,
    _15,
    _21,
}

export enum TimeSigDenominator {
    _2 = 0,
    _4,
    _8,
    _16,
    _32,
}
