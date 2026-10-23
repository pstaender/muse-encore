/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarbendimport/bendinfoconverter.h/.cpp
 */

import { PitchValue, type PitchValues } from '../../../../engraving/types/pitchvalue'
import type { Note } from '../../../../engraving/dom/note'
import { BendSegment, BendType, ImportedBendInfo } from './guitarbendimporttypes'

enum PitchValuesDiff {
    NONE,
    SAME_PITCH_AND_TIME,
    SAME_PITCH_DIFF_TIME,
    INCREASED_PITCH_SAME_TIME,
    INCREASED_PITCH_DIFF_TIME,
    DECREASED_PITCH_DIFF_TIME,
}

export class BendInfoConverter {
    static fillBendInfo(note: Note, pitchValues: PitchValues): ImportedBendInfo {
        const pvd = PitchValuesDiff

        const importedInfo = new ImportedBendInfo()
        let currentPitchDiff: PitchValuesDiff
        let previousPitchDiff = PitchValuesDiff.NONE

        const pitchDiff = (prev: PitchValue, cur: PitchValue): PitchValuesDiff => {
            if (prev.pitch === cur.pitch) {
                return prev.time === cur.time ? pvd.SAME_PITCH_AND_TIME : pvd.SAME_PITCH_DIFF_TIME
            }

            if (prev.time === cur.time) {
                return pvd.INCREASED_PITCH_SAME_TIME
            }

            return prev.pitch < cur.pitch ? pvd.INCREASED_PITCH_DIFF_TIME : pvd.DECREASED_PITCH_DIFF_TIME
        }

        const addPrebendOrHold = (start: PitchValue): void => {
            importedInfo.timeOffsetFromStart = start.time
            importedInfo.pitchOffsetFromStart = start.pitch
            if (start.pitch > 0) {
                importedInfo.type = BendType.PREBEND
            }
        }

        // C++ size_t: pitchValues.size() - 1 wraps around for an empty vector (callers never pass one)
        for (let i = 0; i < pitchValues.length - 1; i++) {
            currentPitchDiff = pitchDiff(pitchValues[i], pitchValues[i + 1])
            if (currentPitchDiff === pvd.SAME_PITCH_AND_TIME) {
                continue
            }

            if (currentPitchDiff === previousPitchDiff && importedInfo.segments.length) {
                const lastSegment = importedInfo.segments[importedInfo.segments.length - 1]
                lastSegment.middleTime = pitchValues[i + 1].time // there is no "hold" in bend, cause both segments go same direction
                lastSegment.endTime = pitchValues[i + 1].time
                lastSegment.endPitch = pitchValues[i + 1].pitch
                continue
            }

            switch (currentPitchDiff) {
            case pvd.NONE:
                break

            case pvd.SAME_PITCH_DIFF_TIME:
            case pvd.INCREASED_PITCH_SAME_TIME:
            {
                if (!importedInfo.segments.length) {
                    addPrebendOrHold(pitchValues[i])
                } else {
                    const lastSegment = importedInfo.segments[importedInfo.segments.length - 1]
                    lastSegment.middleTime = lastSegment.endTime
                    lastSegment.endTime = pitchValues[i + 1].time
                    lastSegment.endPitch = pitchValues[i + 1].pitch
                }

                break
            }

            case pvd.INCREASED_PITCH_DIFF_TIME:
            case pvd.DECREASED_PITCH_DIFF_TIME:
            {
                if (!importedInfo.segments.length) {
                    addPrebendOrHold(pitchValues[i])
                }

                const newSegment = new BendSegment()
                newSegment.startPitch = pitchValues[i].pitch
                newSegment.endPitch = pitchValues[i + 1].pitch
                newSegment.startTime = pitchValues[i].time
                newSegment.middleTime = pitchValues[i + 1].time
                newSegment.endTime = pitchValues[i + 1].time
                importedInfo.segments.push(newSegment)
                break
            }
            }

            previousPitchDiff = currentPitchDiff
        }

        importedInfo.note = note
        if (importedInfo.segments.length) {
            importedInfo.segments[importedInfo.segments.length - 1].endTime = PitchValue.MAX_TIME
        }

        for (const seg of importedInfo.segments) {
            if (seg.endTime - seg.middleTime === 1) {
                seg.middleTime = seg.endTime
            }
        }

        if (importedInfo.segments.length === 1 && importedInfo.type === BendType.NORMAL_BEND
            && importedInfo.segments[0].pitchDiff() === 25) {
            importedInfo.type = BendType.SLIGHT_BEND
        }

        return importedInfo
    }
}
