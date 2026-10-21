/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of parts of src/engraving/dom/mscore.h/.cpp (UpDownMode, the error state: MsError, MScore::setError)
 */

export enum UpDownMode {
    CHROMATIC, OCTAVE, DIATONIC,
}

export enum MsError {
    MS_NO_ERROR,
    NO_NOTE_SELECTED,
    NO_CHORD_REST_SELECTED,
    NO_LYRICS_SELECTED,
    NO_NOTE_REST_SELECTED,
    NO_FLIPPABLE_SELECTED,
    NO_MEASURE_SELECTED,
    NO_STAFF_SELECTED,
    NO_NOTE_FIGUREDBASS_SELECTED,
    NO_NOTE_REST_HARMONY_SELECTED,
    CANNOT_INSERT_TUPLET,
    CANNOT_SPLIT_TUPLET,
    CANNOT_SPLIT_MEASURE_FIRST_BEAT,
    CANNOT_SPLIT_MEASURE_TUPLET,
    INSUFFICIENT_MEASURES,
    CANNOT_SPLIT_MEASURE_REPEAT,
    CANNOT_SPLIT_MEASURE_TOO_SHORT,
    CANNOT_REMOVE_TIME_TUPLET,
    CANNOT_REMOVE_TIME_MEASURE_REPEAT,
    NO_DEST,
    SOURCE_PARTIAL_TUPLET,
    DEST_TUPLET,
    TUPLET_CROSSES_BAR,
    DEST_LOCAL_TIME_SIGNATURE,
    SOURCE_PARTIAL_TREMOLO,
    DEST_TREMOLO,
    NO_MIME,
    DEST_NO_CR,
    CANNOT_CHANGE_LOCAL_TIMESIG_MEASURE_NOT_EMPTY,
    CANNOT_CHANGE_LOCAL_TIMESIG_HAS_EXCERPTS,
    CORRUPTED_MEASURE,
    CANNOT_REMOVE_KEY_SIG,
    CANNOT_JOIN_MEASURE_STAFFTYPE_CHANGE,
    CANNOT_REPEAT_SELECTION,
    TRANSPOSE_NO_FRET_DIAGRAM,
    CANNOT_EXPLODE_IMPLODE_LOCAL_TIMESIG,
}

export class MScore {
    private static s_error = MsError.MS_NO_ERROR
    private static s_errorIsWarning = false

    static setError(e: MsError, warning = false): void {
        MScore.s_error = e
        MScore.s_errorIsWarning = warning
    }

    /** C++ MScore::_error */
    static errorValue(): MsError { return MScore.s_error }
    /** C++ MScore::_errorIsWarning */
    static errorIsWarning(): boolean { return MScore.s_errorIsWarning }
}
