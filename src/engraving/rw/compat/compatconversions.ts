/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of CompatUtils::doCompatibilityConversions() and the conversions it calls (src/engraving/rw/compat/compatutils.cpp).
 * Separate from compatutils.ts because these need the Factory (compatutils.ts is imported by dom/chordlist.ts).
 * Only the master score is handled (no excerpts); linked elements are not handled.
 * TODO(port): replaceStaffTextWithPlayTechniqueAnnotation (PlayTechAnnotation), replaceStaffTextWithCapo (Capo),
 * convertTextLineToNoteAnchoredLine (NoteLine); the replaced elements render like the old staff texts/text lines
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { Fraction } from '../../types/fraction'
import { Spatium } from '../../types/dimension'
import { SymId } from '../../types/symid'
import { DynamicType, ElementType, Key, TextStyleType } from '../../types/types'
import { Sid } from '../../style/styledef'
import { textStyle, TEXT_STYLE_SIZE } from '../../style/textstyle'
import { Factory } from '../../dom/factory'
import { Pid } from '../../dom/propertydata'
import { PropertyFlags } from '../../dom/property'
import { Dynamic } from '../../dom/dynamic'
import { KeySigEvent } from '../../dom/key'
import { FrameType } from '../../dom/textbase'
import { Transpose } from '../../editing/transpose'
import type { MasterScore } from '../../dom/masterscore'
import type { Articulation } from '../../dom/articulation'
import type { Chord } from '../../dom/chord'
import type { Expression } from '../../dom/expression'
import type { Ornament } from '../../dom/ornament'
import type { StaffText } from '../../dom/stafftextbase'
import type { Rest } from '../../dom/rest'
import type { Segment } from '../../dom/segment'
import type { EngravingItem } from '../../dom/engravingitem'

const ORNAMENT_IDS = new Set<SymId>([
    SymId.ornamentTurn,
    SymId.ornamentTurnInverted,
    SymId.ornamentTurnSlash,
    SymId.ornamentTrill,
    SymId.brassMuteClosed,
    SymId.ornamentMordent,
    SymId.ornamentShortTrill,
    SymId.ornamentTremblement,
    SymId.ornamentPrallMordent,
    SymId.ornamentLinePrall,
    SymId.ornamentUpPrall,
    SymId.ornamentUpMordent,
    SymId.ornamentPrecompMordentUpperPrefix,
    SymId.ornamentDownMordent,
    SymId.ornamentPrallUp,
    SymId.ornamentPrallDown,
    SymId.ornamentPrecompSlide,
    SymId.ornamentShake3,
    SymId.ornamentShakeMuffat1,
    SymId.ornamentTremblementCouperin,
    SymId.ornamentPinceCouperin,
])

/** dom/articulation.cpp ARTICULATION_ABOVE_SPLIT_GROUPS / ARTICULATION_BELOW_SPLIT_GROUP */
const ARTICULATION_SPLIT_GROUPS = new Map<SymId, [SymId, SymId]>([
    [SymId.articAccentStaccatoAbove, [SymId.articStaccatoAbove, SymId.articAccentAbove]],
    [SymId.articTenutoAccentAbove, [SymId.articTenutoAbove, SymId.articAccentAbove]],
    [SymId.articTenutoStaccatoAbove, [SymId.articTenutoAbove, SymId.articStaccatoAbove]],
    [SymId.articMarcatoStaccatoAbove, [SymId.articStaccatoAbove, SymId.articMarcatoAbove]],
    [SymId.articMarcatoTenutoAbove, [SymId.articTenutoAbove, SymId.articMarcatoAbove]],
    [SymId.articAccentStaccatoBelow, [SymId.articStaccatoBelow, SymId.articAccentBelow]],
    [SymId.articTenutoAccentBelow, [SymId.articTenutoBelow, SymId.articAccentBelow]],
    [SymId.articTenutoStaccatoBelow, [SymId.articTenutoBelow, SymId.articStaccatoBelow]],
    [SymId.articMarcatoStaccatoBelow, [SymId.articStaccatoBelow, SymId.articMarcatoBelow]],
    [SymId.articMarcatoTenutoBelow, [SymId.articTenutoBelow, SymId.articMarcatoBelow]],
])

/** dom/articulation.cpp splitArticulations() for a single symbol; sorted like the C++ std::set<SymId> */
export function splitArticulation(id: SymId): SymId[] {
    const group = ARTICULATION_SPLIT_GROUPS.get(id)
    return group ? [...new Set(group)].sort((a, b) => a - b) : [id]
}

function chordsOf(score: MasterScore, func: (chord: Chord) => void): void {
    for (let meas = score.firstMeasure(); meas; meas = meas.nextMeasure()) {
        for (let seg = meas.first(); seg; seg = seg.next()) {
            if (!seg.isChordRestType()) {
                continue
            }
            for (const item of seg.elist()) {
                if (item && item.isChord()) {
                    func(item as Chord)
                }
            }
        }
    }
}

function annotationsOf(score: MasterScore, func: (item: EngravingItem, seg: Segment) => void): void {
    for (let meas = score.firstMeasure(); meas; meas = meas.nextMeasure()) {
        for (let seg = meas.first(); seg; seg = seg.next()) {
            for (const item of [...seg.annotations()]) {
                if (item) {
                    func(item, seg)
                }
            }
        }
    }
}

export class CompatConversions {
    static doCompatibilityConversions(masterScore: MasterScore | null): void {
        if (!masterScore) {
            return
        }

        if (masterScore.mscVersion() < 410) {
            CompatConversions.reconstructTypeOfCustomDynamics(masterScore)
            CompatConversions.replaceOldWithNewExpressions(masterScore)
            CompatConversions.replaceOldWithNewOrnaments(masterScore)
            CompatConversions.resetRestVerticalOffset(masterScore)
            CompatConversions.splitArticulations(masterScore)
            CompatConversions.resetArticulationOffsets(masterScore)
            CompatConversions.resetStemLengthsForTwoNoteTrems(masterScore)
        }
        if (masterScore.mscVersion() < 420) {
            CompatConversions.addMissingInitKeyForTransposingInstrument(masterScore)
            // resetFramesExclusionFromParts: only relevant for parts
        }
        if (masterScore.mscVersion() < 440) {
            CompatConversions.mapHeaderFooterStyles(masterScore)
        }

        if (masterScore.mscVersion() < 450) {
            CompatConversions.convertLaissezVibArticToTie(masterScore)
        }
    }

    private static replaceOldWithNewOrnaments(score: MasterScore): void {
        const oldOrnaments: Articulation[] = [] // ornaments used to be articulations

        chordsOf(score, (chord) => {
            for (const articulation of chord.articulations()) {
                if (articulation.isOrnament()) {
                    continue
                }
                if (ORNAMENT_IDS.has(articulation.symId())) {
                    oldOrnaments.push(articulation)
                }
            }
        })

        for (const oldOrnament of oldOrnaments) {
            const parentChord = oldOrnament.parentItem() as unknown as Chord

            const newOrnament = Factory.createItem(ElementType.ORNAMENT, parentChord) as Ornament
            newOrnament.setParent(parentChord)
            newOrnament.setTrack(oldOrnament.track())
            newOrnament.setSymId(oldOrnament.symId())
            newOrnament.setPos(oldOrnament.pos())
            newOrnament.setOrnamentStyle(oldOrnament.ornamentStyle())
            newOrnament.setDirection(oldOrnament.direction())
            newOrnament.setAutoplace(oldOrnament.autoplace())
            newOrnament.setPlayArticulation(oldOrnament.playArticulation())

            parentChord.add(newOrnament)
            parentChord.remove(oldOrnament)
        }
    }

    private static replaceOldWithNewExpressions(score: MasterScore): void {
        const oldExpressions: [StaffText, Segment][] = [] // Expressions used to be staff text

        annotationsOf(score, (item, seg) => {
            if (item.isStaffText() && (item as StaffText).textStyleType() === TextStyleType.EXPRESSION) {
                oldExpressions.push([item as StaffText, seg])
            }
        })

        for (const [oldExpression, parentSegment] of oldExpressions) {
            const newExpression = Factory.createItem(ElementType.EXPRESSION, parentSegment) as Expression
            newExpression.setParent(parentSegment)
            newExpression.setTrack(oldExpression.track())
            newExpression.setXmlText(oldExpression.xmlText())
            CompatConversions.mapPropertiesFromOldExpressions(newExpression, oldExpression)

            parentSegment.add(newExpression)
            parentSegment.removeAnnotation(oldExpression)
        }
    }

    /** C++ Expression::mapPropertiesFromOldExpressions */
    private static mapPropertiesFromOldExpressions(e: Expression, staffText: StaffText): void {
        if (staffText.minDistance().val() !== (e.propertyDefault(Pid.MIN_DISTANCE) as Spatium).val()) {
            e.setMinDistance(staffText.minDistance())
            e.setPropertyFlags(Pid.MIN_DISTANCE, PropertyFlags.UNSTYLED)
        }
        if (staffText.placement() !== e.propertyDefault(Pid.PLACEMENT)) {
            e.setPlacement(staffText.placement())
            e.setPropertyFlags(Pid.PLACEMENT, PropertyFlags.UNSTYLED)
        }
        if (!staffText.offset().equals(e.propertyDefault(Pid.OFFSET) as PointF)) {
            e.setOffset(staffText.offset())
            e.setSnapToDynamics(false)
            e.setPropertyFlags(Pid.OFFSET, PropertyFlags.UNSTYLED)
            e.setPropertyFlags(Pid.SNAP_TO_DYNAMICS, PropertyFlags.UNSTYLED)
        }
        if (staffText.frameType() !== FrameType.NO_FRAME) {
            e.setFrameType(staffText.frameType())
            e.setFrameWidth(staffText.frameWidth())
            e.setFrameColor(staffText.frameColor())
            e.setBgColor(staffText.bgColor())
            e.setFrameRound(staffText.frameRound())
        }
    }

    private static reconstructTypeOfCustomDynamics(score: MasterScore): void {
        // Before version 4.1, Dynamics containing custom text were saved as type "other"
        // We check the string to see if we can reconstruct their true type.
        annotationsOf(score, (item) => {
            if (item.isDynamic() && (item as Dynamic).dynamicType() === DynamicType.OTHER) {
                const dynamic = item as Dynamic
                dynamic.setDynamicType(CompatConversions.reconstructDynamicTypeFromString(dynamic))
            }
        })
    }

    private static s_sortedDynList: { type: DynamicType; text: string }[] | null = null

    private static reconstructDynamicTypeFromString(dynamic: Dynamic): DynamicType {
        if (!CompatConversions.s_sortedDynList) {
            // copy of dynList sorted by string length (C++ std::sort is not stable, but the order of equal lengths
            // only matters for strings that contain each other, which have different lengths)
            CompatConversions.s_sortedDynList = Dynamic.dynamicList().map((d, i) => ({ type: i as DynamicType, text: d.text }))
                .sort((a, b) => [...b.text].length - [...a.text].length)
        }

        for (const dyn of CompatConversions.s_sortedDynList) {
            if (dyn.text.length === 0) {
                return DynamicType.OTHER
            }
            if (dynamic.xmlText().includes(dyn.text)) {
                return dyn.type
            }
        }
        return DynamicType.OTHER
    }

    private static splitArticulations(masterScore: MasterScore): void {
        const toRemove: Articulation[] = []
        chordsOf(masterScore, (chord) => {
            for (const a of chord.articulations()) {
                if (splitArticulation(a.symId()).length <= 1) {
                    continue
                }
                toRemove.push(a)
            }
        })
        // separate into individual articulations
        for (const combinedArtic of toRemove) {
            const components = splitArticulation(combinedArtic.symId())
            const parentChord = combinedArtic.parentItem() as unknown as Chord
            for (const id of components) {
                if (parentChord.articulations().some(a => a.symId() === id)) { // Chord::hasArticulation
                    continue
                }
                const newArtic = Factory.createItem(ElementType.ARTICULATION, parentChord) as Articulation
                newArtic.setSymId(id)
                newArtic.setParent(parentChord)
                newArtic.setTrack(combinedArtic.track())
                newArtic.setPos(combinedArtic.pos())
                newArtic.setDirection(combinedArtic.direction())
                newArtic.setAnchor(combinedArtic.anchor())
                newArtic.setColor(combinedArtic.color())
                newArtic.setPlayArticulation(combinedArtic.playArticulation())
                newArtic.setVisible(combinedArtic.visible())
                newArtic.setOrnamentStyle(combinedArtic.ornamentStyle())
                parentChord.add(newArtic)
            }
        }
        // finally, remove the combined articulations
        for (const combinedArtic of toRemove) {
            const parentChord = combinedArtic.parentItem() as unknown as Chord
            parentChord.remove(combinedArtic)
        }
    }

    private static resetRestVerticalOffset(masterScore: MasterScore): void {
        for (let measure = masterScore.firstMeasure(); measure; measure = measure.nextMeasure()) {
            for (let segment = measure.first(); segment; segment = segment.next()) {
                if (!segment.isChordRestType()) {
                    continue
                }
                for (const item of segment.elist()) {
                    if (!item || !item.isRest()) {
                        continue
                    }
                    const rest = item as Rest
                    if (rest.offset().y() !== 0) {
                        rest.setProperty(Pid.OFFSET, new PointF(rest.offset().x(), 0.0))
                    }
                }
            }
        }
    }

    private static resetArticulationOffsets(masterScore: MasterScore): void {
        chordsOf(masterScore, (chord) => {
            for (const artic of chord.articulations()) {
                artic.setProperty(Pid.OFFSET, new PointF())
            }
        })
    }

    private static resetStemLengthsForTwoNoteTrems(masterScore: MasterScore): void {
        chordsOf(masterScore, (chord) => {
            const trem = chord.tremoloTwoChord()
            const stem = chord.stem()
            if (stem && trem) {
                if (stem.userLength().val() !== 0) {
                    stem.setUserLength(new Spatium(0))
                }
            }
        })
    }

    private static addMissingInitKeyForTransposingInstrument(score: MasterScore): void {
        for (const part of score.parts()) {
            const instrument = part.instrument()
            const v = instrument.transpose()
            if (v.chromatic % 12) {
                for (const staff of part.staves()) {
                    const keys = staff.keyList()
                    if (!keys.has(0)) {
                        const kse = new KeySigEvent()
                        const key = Key.C
                        let cKey = key
                        if (!score.style().styleB(Sid.concertPitch)) {
                            cKey = Transpose.transposeKey(key, v)
                        }
                        kse.setConcertKey(cKey)
                        kse.setKey(key)
                        // C++ score->undoChangeKeySig(): the key sig at tick 0 is generated by the layout
                        staff.setKey(new Fraction(0, 1), kse)
                    }
                }
            }
        }
    }

    private static mapHeaderFooterStyles(score: MasterScore): void {
        // Copyright and page numbers used header/footer styling before 4.4 - after 4.4 these have their own styles. To ensure nothing
        // changes visually when loading a pre-4.4 score for the first time, we must search the header/footer strings for copyright/page
        // number macros and set the "defaults" for copyright/page number styles based on where the macros were inserted...
        const doMap = (type: TextStyleType, headerFooterStringSids: Sid[]): void => {
            const headerFooterTextStyle = textStyle(type)!
            const copyrightTextStyle = textStyle(TextStyleType.COPYRIGHT)!
            const pageNumberTextStyle = textStyle(TextStyleType.PAGE_NUMBER)!

            //! NOTE: Keep in sync with Page::replaceTextMacros
            const copyrightSearch = /\$[cC]/
            const pageNumberSearch = /\$[pPnN]/

            let haveMappedCopyright = false
            let haveMappedPageNumber = false
            for (const sid of headerFooterStringSids) {
                const s = score.style().styleSt(sid)
                if (!haveMappedCopyright && copyrightSearch.test(s)) {
                    for (let i = 0; i < TEXT_STYLE_SIZE; ++i) {
                        const pv = score.style().styleV(headerFooterTextStyle[i].sid)
                        score.style().set(copyrightTextStyle[i].sid, pv)
                    }
                    haveMappedCopyright = true
                }
                if (!haveMappedPageNumber && pageNumberSearch.test(s)) {
                    for (let i = 0; i < TEXT_STYLE_SIZE; ++i) {
                        const pv = score.style().styleV(headerFooterTextStyle[i].sid)
                        score.style().set(pageNumberTextStyle[i].sid, pv)
                    }
                    haveMappedPageNumber = true
                }
            }
        }

        doMap(TextStyleType.HEADER, [Sid.oddHeaderL, Sid.oddHeaderC, Sid.oddHeaderR,
            Sid.evenHeaderL, Sid.evenHeaderC, Sid.evenHeaderR])
        doMap(TextStyleType.FOOTER, [Sid.oddFooterL, Sid.oddFooterC, Sid.oddFooterR,
            Sid.evenFooterL, Sid.evenFooterC, Sid.evenFooterR])
    }

    private static convertLaissezVibArticToTie(masterScore: MasterScore): void {
        const oldArtics: Articulation[] = []

        chordsOf(masterScore, (chord) => {
            for (const a of chord.articulations()) {
                if (a.isLaissezVib()) {
                    oldArtics.push(a)
                }
            }
        })

        for (const oldArtic of oldArtics) {
            const parentChord = oldArtic.parentItem() as unknown as Chord
            const parentNote = oldArtic.up() ? parentChord.upNote() : parentChord.downNote()

            parentChord.remove(oldArtic)

            const lv = Factory.createItem(ElementType.LAISSEZ_VIB, parentNote) as EngravingItem
            lv.setParent(parentNote)
            parentNote.add(lv)
        }
    }
}
