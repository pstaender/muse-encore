/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/clefkeytimesigpagemodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'
import { TimeSigPlacement } from '../../engraving/types/types'

export class ClefKeyTimeSigPageModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.genClef,
            Sid.hideTabClefAfterFirst,
            Sid.genCourtesyClef,
            Sid.tabClef,
            Sid.timeSigPlacement,
            Sid.timeSigNormalStyle,
            Sid.timeSigAboveStyle,
            Sid.timeSigAcrossStyle,
            Sid.timeSigNormalScale,
            Sid.timeSigAboveScale,
            Sid.timeSigAcrossScale,
            Sid.timeSigNormalScaleLock,
            Sid.timeSigAboveScaleLock,
            Sid.timeSigAcrossScaleLock,
            Sid.timeSigNormalNumDist,
            Sid.timeSigAboveNumDist,
            Sid.timeSigAcrossNumDist,
            Sid.timeSigNormalY,
            Sid.timeSigAboveY,
            Sid.timeSigAcrossY,
            Sid.timeSigCenterOnBarline,
            Sid.timeSigVSMarginCentered,
            Sid.timeSigVSMarginNonCentered,
            Sid.timeSigCenterAcrossStaveGroup,
            Sid.genCourtesyTimesig,
            Sid.genKeysig,
            Sid.genCourtesyKeysig,
            Sid.changesBeforeBarlineRepeats,
            Sid.changesBeforeBarlineOtherJumps,
            Sid.placeClefsBeforeRepeats,
            Sid.changesBetweenEndStartRepeat,
            Sid.showCourtesiesRepeats,
            Sid.useParensRepeatCourtesies,
            Sid.showCourtesiesOtherJumps,
            Sid.useParensOtherJumpCourtesies,
            Sid.showCourtesiesAfterCancellingRepeats,
            Sid.useParensRepeatCourtesiesAfterCancelling,
            Sid.showCourtesiesAfterCancellingOtherJumps,
            Sid.useParensOtherJumpCourtesiesAfterCancelling,
            Sid.smallParens,
            Sid.keySigNaturals,
            Sid.keySigShowNaturalsChangingSharpsFlats,
        ])
    }

    genClef(): StyleItem { return this.styleItem(Sid.genClef) }
    hideTabClefAfterFirst(): StyleItem { return this.styleItem(Sid.hideTabClefAfterFirst) }
    genCourtesyClef(): StyleItem { return this.styleItem(Sid.genCourtesyClef) }
    tabClef(): StyleItem { return this.styleItem(Sid.tabClef) }
    timeSigPlacement(): StyleItem { return this.styleItem(Sid.timeSigPlacement) }
    timeSigNormalStyle(): StyleItem { return this.styleItem(Sid.timeSigNormalStyle) }
    timeSigAboveStyle(): StyleItem { return this.styleItem(Sid.timeSigAboveStyle) }
    timeSigAcrossStyle(): StyleItem { return this.styleItem(Sid.timeSigAcrossStyle) }
    timeSigNormalNumDist(): StyleItem { return this.styleItem(Sid.timeSigNormalNumDist) }
    timeSigAboveNumDist(): StyleItem { return this.styleItem(Sid.timeSigAboveNumDist) }
    timeSigAcrossNumDist(): StyleItem { return this.styleItem(Sid.timeSigAcrossNumDist) }
    timeSigNormalY(): StyleItem { return this.styleItem(Sid.timeSigNormalY) }
    timeSigAboveY(): StyleItem { return this.styleItem(Sid.timeSigAboveY) }
    timeSigAcrossY(): StyleItem { return this.styleItem(Sid.timeSigAcrossY) }
    timeSigCenterOnBarline(): StyleItem { return this.styleItem(Sid.timeSigCenterOnBarline) }
    timeSigVSMarginCentered(): StyleItem { return this.styleItem(Sid.timeSigVSMarginCentered) }
    timeSigVSMarginNonCentered(): StyleItem { return this.styleItem(Sid.timeSigVSMarginNonCentered) }
    timeSigCenterAcrossStaveGroup(): StyleItem { return this.styleItem(Sid.timeSigCenterAcrossStaveGroup) }
    timeSigNormalScale(): StyleItem { return this.styleItem(Sid.timeSigNormalScale) }
    timeSigAboveScale(): StyleItem { return this.styleItem(Sid.timeSigAboveScale) }
    timeSigAcrossScale(): StyleItem { return this.styleItem(Sid.timeSigAcrossScale) }
    timeSigNormalScaleLock(): StyleItem { return this.styleItem(Sid.timeSigNormalScaleLock) }
    timeSigAboveScaleLock(): StyleItem { return this.styleItem(Sid.timeSigAboveScaleLock) }
    timeSigAcrossScaleLock(): StyleItem { return this.styleItem(Sid.timeSigAcrossScaleLock) }
    genCourtesyTimesig(): StyleItem { return this.styleItem(Sid.genCourtesyTimesig) }
    genKeysig(): StyleItem { return this.styleItem(Sid.genKeysig) }
    genCourtesyKeysig(): StyleItem { return this.styleItem(Sid.genCourtesyKeysig) }
    changesBeforeBarlineRepeats(): StyleItem { return this.styleItem(Sid.changesBeforeBarlineRepeats) }
    changesBeforeBarlineOtherJumps(): StyleItem { return this.styleItem(Sid.changesBeforeBarlineOtherJumps) }
    placeClefsBeforeRepeats(): StyleItem { return this.styleItem(Sid.placeClefsBeforeRepeats) }
    changesBetweenEndStartRepeat(): StyleItem { return this.styleItem(Sid.changesBetweenEndStartRepeat) }
    showCourtesiesRepeats(): StyleItem { return this.styleItem(Sid.showCourtesiesRepeats) }
    useParensRepeatCourtesies(): StyleItem { return this.styleItem(Sid.useParensRepeatCourtesies) }
    showCourtesiesOtherJumps(): StyleItem { return this.styleItem(Sid.showCourtesiesOtherJumps) }
    useParensOtherJumpCourtesies(): StyleItem { return this.styleItem(Sid.useParensOtherJumpCourtesies) }
    showCourtesiesAfterCancellingRepeats(): StyleItem { return this.styleItem(Sid.showCourtesiesAfterCancellingRepeats) }
    useParensRepeatCourtesiesAfterCancelling(): StyleItem { return this.styleItem(Sid.useParensRepeatCourtesiesAfterCancelling) }
    showCourtesiesAfterCancellingOtherJumps(): StyleItem { return this.styleItem(Sid.showCourtesiesAfterCancellingOtherJumps) }
    useParensOtherJumpCourtesiesAfterCancelling(): StyleItem { return this.styleItem(Sid.useParensOtherJumpCourtesiesAfterCancelling) }
    smallParens(): StyleItem { return this.styleItem(Sid.smallParens) }
    keySigNaturals(): StyleItem { return this.styleItem(Sid.keySigNaturals) }
    keySigShowNaturalsChangingSharpsFlats(): StyleItem { return this.styleItem(Sid.keySigShowNaturalsChangingSharpsFlats) }

    resetStyleAndSize(): void {
        const NORMAL_IDS = [
            Sid.timeSigNormalStyle,
            Sid.timeSigNormalScale,
            Sid.timeSigNormalScaleLock,
            Sid.timeSigNormalNumDist,
            Sid.timeSigNormalY,
        ]
        const ABOVE_IDS = [
            Sid.timeSigAboveStyle,
            Sid.timeSigAboveScale,
            Sid.timeSigAboveScaleLock,
            Sid.timeSigAboveNumDist,
            Sid.timeSigAboveY,
            Sid.timeSigCenterOnBarline,
            Sid.timeSigVSMarginCentered,
            Sid.timeSigVSMarginNonCentered,
        ]
        const ACROSS_IDS = [
            Sid.timeSigAcrossStyle,
            Sid.timeSigAcrossScale,
            Sid.timeSigAcrossScaleLock,
            Sid.timeSigAcrossNumDist,
            Sid.timeSigAcrossY,
            Sid.timeSigCenterAcrossStaveGroup,
        ]

        switch (this.styleItem(Sid.timeSigPlacement).value() as TimeSigPlacement) {
        case TimeSigPlacement.NORMAL: return this.currentNotationStyle().resetStyleValues(NORMAL_IDS)
        case TimeSigPlacement.ABOVE_STAVES: return this.currentNotationStyle().resetStyleValues(ABOVE_IDS)
        case TimeSigPlacement.ACROSS_STAVES: return this.currentNotationStyle().resetStyleValues(ACROSS_IDS)
        default:
            return
        }
    }
}
