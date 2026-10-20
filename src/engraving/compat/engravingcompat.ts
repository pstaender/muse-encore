/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/compat/engravingcompat.h/.cpp
 *
 * C++ (NotationProject::load) calls doPreLayoutCompatIfNeeded() after the first layout of a loaded score
 * and doPostLayoutCompatIfNeeded() after the second one. Only the master score is handled (no excerpts).
 */

import { PointF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import { SymId } from '../types/symid'
import {
    AlignH, DirectionV, DPMM, ElementType, HookType, PlacementV, TextStyleType, VOICES, VoiceAssignment, staff2track, track2staff,
} from '../types/types'
import { Sid } from '../style/styledef'
import { Pid } from '../dom/propertydata'
import { PropertyFlags } from '../dom/property'
import { CompatUtils } from '../rw/compat/compatutils'
import type { MasterScore } from '../dom/masterscore'
import type { EngravingItem } from '../dom/engravingitem'
import type { Measure } from '../dom/measure'
import type { Marker } from '../dom/marker'
import type { Pedal } from '../dom/pedal'
import type { TextBase } from '../dom/textbase'
import type { Box } from '../dom/box'
import type { ChordRest } from '../dom/chordrest'
import type { Chord } from '../dom/chord'
import type { Spanner } from '../dom/spanner'
import type { LyricsLine } from '../dom/lyricsline'
import type { Note } from '../dom/note'
import { EditChord } from '../editing/editchord'

const OFFSET_UNIT_CONVERT_TYPES: readonly ElementType[] = [
    ElementType.FINGERING,
    ElementType.HAMMER_ON_PULL_OFF_TEXT,
    ElementType.LYRICS,
    ElementType.TAPPING,
]

export class EngravingCompat {
    static doPreLayoutCompatIfNeeded(score: MasterScore): void {
        const mscVersion = score.mscVersion()

        if (mscVersion < 470) {
            EngravingCompat.pre470TextCompat(score)
            EngravingCompat.migrateNoteParens(score)
        }

        if (mscVersion < 460) {
            EngravingCompat.resetMarkerLeftFontSize(score)
            EngravingCompat.resetRestVerticalOffsets(score)
            EngravingCompat.adjustVBoxDistances(score)
        }

        if (mscVersion < 440) {
            EngravingCompat.correctPedalEndPoints(score)
            EngravingCompat.migrateDynamicPosOnVocalStaves(score)
            if (mscVersion >= 420) {
                EngravingCompat.undoStaffTextExcludeFromPart(score)
            }
        }
    }

    /** returns true if the score needs another layout */
    static doPostLayoutCompatIfNeeded(score: MasterScore): boolean {
        let needRelayout = false

        const mscVersion = score.mscVersion()

        if (mscVersion < 470) {
            needRelayout = EngravingCompat.setLyricLineVisibility(score) || needRelayout
        }

        if (mscVersion < 440) {
            needRelayout = EngravingCompat.relayoutUserModifiedCrossStaffBeams(score) || needRelayout
        }

        return needRelayout
    }

    private static correctPedalEndPoints(score: MasterScore): void {
        // Pedal lines ending with 45° hook used to be hacked to end before their actual end duration.
        // Hack is now removed, so we need to correct them to preserve engraving result. (M.S.)
        for (const spanner of score.spanner()) {
            if (spanner.isPedal() && (spanner as Pedal).endHookType() === HookType.HOOK_45) {
                const endCR = score.findChordRestEndingBeforeTickInStaff(spanner.tick2(), track2staff(spanner.track()))
                if (endCR) {
                    for (const item of spanner.linkList()) {
                        (item as Spanner).setTick2(endCR.tick())
                    }
                }
            }
        }
    }

    private static undoStaffTextExcludeFromPart(score: MasterScore): void {
        for (let mb = score.first(); mb; mb = mb.next()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (let segment = (mb as Measure).first(); segment; segment = segment.next()) {
                if (!segment.isChordRestType()) {
                    continue
                }
                for (const item of segment.annotations()) {
                    if (!item || !item.isStaffText()) {
                        continue
                    }
                    if (item.excludeFromOtherParts()) {
                        item.setProperty(Pid.EXCLUDE_FROM_OTHER_PARTS, false)
                        // TODO(port): linked items in excerpts
                    }
                }
            }
        }
    }

    private static migrateDynamicPosOnVocalStaves(masterScore: MasterScore): void {
        const migrateVoiceAssignmentAndPosition = (item: EngravingItem): void => {
            if (item.voice() !== 0) {
                item.setProperty(Pid.VOICE_ASSIGNMENT, VoiceAssignment.CURRENT_VOICE_ONLY)
            }
            // Migrate position on vocal staves (to match old default, which used to be below)
            const staff = item.staff()
            const part = staff ? staff.part() : null
            const instrument = part ? part.instrument() : null
            const isVocalInstrument = !!instrument && instrument.isVocalInstrument()
            const directionIsDefault = item.getProperty(Pid.DIRECTION) === item.propertyDefault(Pid.DIRECTION)
            const defaultPlacement = masterScore.style().styleV(item.getPropertyStyle(Pid.PLACEMENT)) as PlacementV
            const defaultIsBelow = defaultPlacement === PlacementV.BELOW

            if (isVocalInstrument && directionIsDefault && defaultIsBelow) {
                item.setProperty(Pid.DIRECTION, DirectionV.DOWN)
                item.setPropertyFlags(Pid.DIRECTION, PropertyFlags.UNSTYLED)
            }
        }

        for (let mb = masterScore.first(); mb; mb = mb.next()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (let segment = (mb as Measure).first(); segment; segment = segment.next()) {
                if (!segment.isChordRestType()) {
                    continue
                }
                for (const item of segment.annotations()) {
                    if (item && item.hasVoiceAssignmentProperties()) {
                        migrateVoiceAssignmentAndPosition(item)
                    }
                }
            }
        }

        for (const spanner of masterScore.spanner()) {
            if (spanner.isHairpin()) {
                migrateVoiceAssignmentAndPosition(spanner)
            }
        }
    }

    private static resetMarkerLeftFontSize(masterScore: MasterScore): void {
        // Reset the new incorrect 4.4.0 - 4.4.2 default size of 11 to the previous correct size of 18
        const INCORRECT_DEFAULT_SIZE = 11.0
        const CORRECT_DEFAULT_SIZE = 18.0
        const needsAdjustMarkerSize = masterScore.mscoreVersion().includes('4.4') && masterScore.mscoreVersion() !== '4.4.3'
        if (!needsAdjustMarkerSize || masterScore.style().styleD(Sid.repeatLeftFontSize) !== INCORRECT_DEFAULT_SIZE) {
            return
        }
        masterScore.style().set(Sid.repeatLeftFontSize, CORRECT_DEFAULT_SIZE)

        for (let mb = masterScore.first(); mb; mb = mb.next()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (const item of mb.el()) {
                if (!item.isMarker()) {
                    continue
                }
                const marker = item as Marker
                if (marker.textStyleType() !== TextStyleType.REPEAT_LEFT || marker.size() !== INCORRECT_DEFAULT_SIZE) {
                    continue
                }
                marker.setSize(CORRECT_DEFAULT_SIZE)
            }
        }
    }

    private static resetRestVerticalOffsets(score: MasterScore): void {
        for (let mb = score.first(); mb; mb = mb.next()) {
            if (!mb.isMeasure()) {
                continue
            }
            const measure = mb as Measure
            for (let staff = 0; staff < score.nstaves(); ++staff) {
                if (!measure.hasVoices(staff)) {
                    continue
                }
                const startTrack = staff2track(staff)
                const endTrack = startTrack + VOICES
                for (let seg = measure.first(); seg; seg = seg.next()) {
                    if (!seg.isChordRestType()) {
                        continue
                    }
                    for (let track = startTrack; track < endTrack; ++track) {
                        const item = seg.element(track)
                        if (item && item.isRest()) {
                            item.resetProperty(Pid.OFFSET)
                        }
                    }
                }
            }
        }
    }

    private static adjustVBoxDistances(score: MasterScore): void {
        for (let mb = score.first(); mb; mb = mb.next()) {
            const nextmb = mb.next()
            if (mb.isVBoxBase()) {
                const vbox = mb as Box
                vbox.setProperty(Pid.PADDING_TO_NOTATION_ABOVE, new Spatium(0)) // Because pre-4.6 these didn't exist
                vbox.setPropertyFlags(Pid.PADDING_TO_NOTATION_ABOVE, PropertyFlags.UNSTYLED)
                vbox.setProperty(Pid.PADDING_TO_NOTATION_BELOW, new Spatium(0))
                vbox.setPropertyFlags(Pid.PADDING_TO_NOTATION_BELOW, PropertyFlags.UNSTYLED)
                if (nextmb && nextmb.isVBoxBase()) {
                    const first = mb as Box
                    const second = nextmb as Box
                    if (first.bottomGap().val() > 0 && second.topGap().val() > 0) {
                        // Because pre-4.6 these used to be added
                        first.setProperty(Pid.BOTTOM_GAP, new Spatium(first.bottomGap().val() + second.topGap().val()))
                        first.setPropertyFlags(Pid.BOTTOM_GAP, PropertyFlags.UNSTYLED)
                    }
                }
            }
        }
    }

    private static pre470TextCompat(masterScore: MasterScore): void {
        const doCompat = (item: EngravingItem): void => {
            if (!item.isTextBase()) {
                return
            }

            const text = item as TextBase

            if (!text.isStyled(Pid.FRAME_ROUND)) {
                text.setFrameRound(CompatUtils.convertPre470FrameRadius(text.frameRound().val()))
            }

            // Text offset could have been in mm for these types prior to 4.7
            // Convert actual distance to spatium
            if (OFFSET_UNIT_CONVERT_TYPES.includes(item.type()) && !item.sizeIsSpatiumDependent()) {
                let offset = item.offset()
                const spatium = item.style().spatium()
                offset = offset.div(spatium)
                offset = offset.times(DPMM)

                item.setProperty(Pid.OFFSET, offset)
            }

            // Staff text, system text, and harp pedal diagrams are the only types which are attached to notes and weren't already
            // placed with their left edges / centres / right edges aligned to the left / centre / right of the notehead
            if (text.positionRelativeToNoteheadRest()
                && (text.isStaffText() || text.isSystemText() || text.isHarpPedalDiagram())) {
                const mag = item.staff() ? item.staff()!.staffMag(item) : 1.0
                const xAdj = item.symWidth(SymId.noteheadBlack) * mag

                switch (text.position()) {
                case AlignH.HCENTER:
                    text.setProperty(Pid.OFFSET, new PointF(text.offset().x() - xAdj / 2, text.offset().y()))
                    break
                case AlignH.RIGHT:
                    text.setProperty(Pid.OFFSET, new PointF(text.offset().x() - xAdj, text.offset().y()))
                    break
                default:
                    break
                }
            }
        }

        masterScore.scanElements(doCompat)
    }

    private static migrateNoteParens(masterScore: MasterScore): void {
        masterScore.scanElements(EngravingCompat.doMigrateNoteParens)
    }

    /** C++ CompatUtils::doMigrateNoteParens (here to avoid the import cycle chordlist -> compatutils -> factory) */
    static doMigrateNoteParens(item: EngravingItem): void {
        if (!item.isNote()) {
            return
        }
        const note = item as Note
        if (!note.leftParen() && !note.rightParen()) {
            return
        }

        if (note.leftParen()) {
            note.remove(note.leftParen()!)
        }

        if (note.rightParen()) {
            note.remove(note.rightParen()!)
        }

        const chord = note.chord()!

        EditChord.addChordParentheses(chord, [note])
    }

    private static relayoutUserModifiedCrossStaffBeams(score: MasterScore): boolean {
        if (score.mscVersion() >= 440) {
            return false
        }
        let found = false

        const findBeam = (cr: ChordRest): void => {
            const beam = cr.beam()
            if (beam && beam.userModified() && beam.cross() && beam.elements()[0] === cr) {
                found = true
                // C++ beam->triggerLayout(): the following layout lays out the beam again
            }
        }

        for (let mb = score.first(); mb; mb = mb.next()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (let seg = (mb as Measure).first(); seg; seg = seg.next()) {
                if (!seg.isChordRestType()) {
                    continue
                }
                for (const item of seg.elist()) {
                    if (!item) {
                        continue
                    }
                    findBeam(item as ChordRest)
                    if (item.isChord()) {
                        for (const grace of (item as Chord).graceNotes()) {
                            findBeam(grace)
                        }
                    }
                }
            }
        }

        return found
    }

    private static setLyricLineVisibility(masterScore: MasterScore): boolean {
        let needRelayout = false
        for (const sp of masterScore.unmanagedSpanners()) {
            if (!sp.isLyricsLine()) {
                continue
            }

            const ll = sp as LyricsLine
            if (!ll.lyrics() || ll.visible() === ll.lyrics()!.visible()) {
                continue
            }

            ll.setVisible(ll.lyrics()!.visible())
            needRelayout = true
        }

        return needRelayout
    }
}
