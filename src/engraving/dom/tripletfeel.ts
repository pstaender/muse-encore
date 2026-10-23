/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/tripletfeel.h/.cpp
 */

import { TranslatableString } from '../../framework/global/types/translatablestring'
import { Constants } from '../types/constants'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem } from './engravingitem'
import type { ElementStyle } from './engravingobject'
import { Pid } from './property'
import type { Segment } from './segment'
import { SystemText } from './stafftextbase'

export enum TripletFeelType {
    NONE,
    TRIPLET_8TH,
    TRIPLET_16TH,
    DOTTED_8TH,
    DOTTED_16TH,
    SCOTTISH_8TH,
    SCOTTISH_16TH,
}

const tripletFeelStyle: ElementStyle = [
    { sid: Sid.subTitleFontSize, pid: Pid.FONT_SIZE }, // TODO: add styles
    { sid: Sid.tempoFontStyle, pid: Pid.FONT_STYLE },
]

const tupletSymbols = new Map<TripletFeelType, string>([
    [TripletFeelType.TRIPLET_8TH, '%1textBlackNoteShortStem%2'
        + '%1textCont8thBeamShortStem%2'
        + '%1textBlackNoteFrac8thShortStem%2'
        + ' = '
        + '%1textBlackNoteShortStem%2'
        + '%1textTupletBracketStartShortStem%2'
        + '%1textTuplet3ShortStem%2'
        + '%1note8thUp%2'
        + '%1textTupletBracketEndShortStem%2'],
    [TripletFeelType.TRIPLET_16TH, '%1textBlackNoteShortStem%2'
        + '%1textCont16thBeamShortStem%2'
        + '%1textBlackNoteFrac16thShortStem%2'
        + ' = '
        + '%1textBlackNoteShortStem%2'
        + '%1textCont8thBeamShortStem%2'
        + '%1textTuplet3ShortStem%2'
        + '%1textBlackNoteFrac16thShortStem%2'],
    [TripletFeelType.DOTTED_8TH, '%1textBlackNoteShortStem%2'
        + '%1textCont8thBeamShortStem%2'
        + '%1textBlackNoteFrac8thShortStem%2'
        + ' = '
        + '%1textBlackNoteShortStem%2'
        + '%1textCont8thBeamShortStem%2'
        + '%1textAugmentationDot%2'
        + '%1textCont8thBeamShortStem%2'
        + '%1textBlackNoteFrac16thShortStem%2'],
    [TripletFeelType.DOTTED_16TH, '%1textBlackNoteShortStem%2'
        + '%1textCont16thBeamShortStem%2'
        + '%1textBlackNoteFrac16thShortStem%2'
        + ' = '
        + '%1textBlackNoteLongStem%2'
        + '%1textCont16thBeamLongStem%2'
        + '%1textAugmentationDot%2'
        + '%1textCont16thBeamLongStem%2'
        + '%1textBlackNoteFrac32ndLongStem%2'],
    [TripletFeelType.SCOTTISH_8TH, '%1textBlackNoteShortStem%2'
        + '%1textCont8thBeamShortStem%2'
        + '%1textBlackNoteFrac8thShortStem%2'
        + ' = '
        + '%1textBlackNoteShortStem%2'
        + '%1textCont16thBeamShortStem%2'
        + '%1textBlackNoteFrac8thShortStem%2'
        + '%1textAugmentationDot%2'],
    [TripletFeelType.SCOTTISH_16TH, '%1textBlackNoteShortStem%2'
        + '%1textCont16thBeamShortStem%2'
        + '%1textBlackNoteFrac16thShortStem%2'
        + ' = '
        + '%1textBlackNoteLongStem%2'
        + '%1textCont32ndBeamLongStem%2'
        + '%1textBlackNoteFrac16thLongStem%2'
        + '%1textAugmentationDot%2'],
    [TripletFeelType.NONE, '%1textBlackNoteShortStem%2'
        + '%1textCont8thBeamShortStem%2'
        + '%1textBlackNoteFrac8thShortStem%2'
        + ' = '
        + '%1textBlackNoteShortStem%2'
        + '%1textCont8thBeamShortStem%2'
        + '%1textBlackNoteFrac8thShortStem%2'],
])

const tripletFeelNames = new Map<TripletFeelType, TranslatableString>([
    [TripletFeelType.TRIPLET_8TH, new TranslatableString('engraving/tripletfeel', 'Triplet 8th')],
    [TripletFeelType.TRIPLET_16TH, new TranslatableString('engraving/tripletfeel', 'Triplet 16th')],
    [TripletFeelType.DOTTED_8TH, new TranslatableString('engraving/tripletfeel', 'Dotted 8th')],
    [TripletFeelType.DOTTED_16TH, new TranslatableString('engraving/tripletfeel', 'Dotted 16th')],
    [TripletFeelType.SCOTTISH_8TH, new TranslatableString('engraving/tripletfeel', 'Scottish 8th')],
    [TripletFeelType.SCOTTISH_16TH, new TranslatableString('engraving/tripletfeel', 'Scottish 16th')],
    [TripletFeelType.NONE, new TranslatableString('engraving/tripletfeel', 'No triplet feel')],
])

const eightDivision = 2
const sixteenthDivision = 4
const tripletRatio = 66
const dottedRatio = 75
const scottishRatio = 25
const zeroRatio = 0

export class TripletFeel extends SystemText {
    private m_tripletFeelType = TripletFeelType.NONE

    constructor(parent: Segment | null = null, tripletFillType: TripletFeelType = TripletFeelType.NONE) {
        super(parent, TextStyleType.SYSTEM, ElementType.TRIPLET_FEEL)
        this.m_tripletFeelType = tripletFillType
        this.setTripletProperty()
        this.initElementStyle(tripletFeelStyle)
    }

    setTripletProperty(): void {
        this.setSwing(true)

        switch (this.m_tripletFeelType) {
        case TripletFeelType.TRIPLET_8TH:
            this.setSwingParameters(Constants.DIVISION / eightDivision, tripletRatio)
            break
        case TripletFeelType.TRIPLET_16TH:
            this.setSwingParameters(Constants.DIVISION / sixteenthDivision, tripletRatio)
            break
        case TripletFeelType.DOTTED_8TH:
            this.setSwingParameters(Constants.DIVISION / eightDivision, dottedRatio)
            break
        case TripletFeelType.DOTTED_16TH:
            this.setSwingParameters(Constants.DIVISION / sixteenthDivision, dottedRatio)
            break
        case TripletFeelType.SCOTTISH_8TH:
            this.setSwingParameters(Constants.DIVISION / eightDivision, scottishRatio)
            break
        case TripletFeelType.SCOTTISH_16TH:
            this.setSwingParameters(Constants.DIVISION / sixteenthDivision, scottishRatio)
            break
        case TripletFeelType.NONE:
            this.setSwingParameters(0, zeroRatio)
            break
        }

        // String::arg(a1, a2): replaces all %1 and %2
        this.setXmlText(tupletSymbols.get(this.m_tripletFeelType)!
            .replaceAll('%1', '<sym>staffPosLower3</sym><sym>').replaceAll('%2', '</sym>'))
    }

    getTripletFeelType(): TripletFeelType { return this.m_tripletFeelType }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.FONT_SIZE:
            return this.style().styleV(Sid.subTitleFontSize)
        case Pid.FONT_STYLE:
            return this.style().styleV(Sid.tempoFontStyle)
        default:
            return super.propertyDefault(propertyId)
        }
    }

    override getPropertyStyle(id: Pid): Sid {
        switch (id) {
        case Pid.FONT_SIZE:
            return Sid.subTitleFontSize
        case Pid.FONT_STYLE:
            return Sid.tempoFontStyle
        default:
            break
        }
        return super.getPropertyStyle(id)
    }

    override subtypeUserName(): TranslatableString {
        return tripletFeelNames.get(this.m_tripletFeelType)!
    }

    override accessibleInfo(): string {
        return `${EngravingItem.prototype.accessibleInfo.call(this)}: ${this.translatedTypeUserName()}`
    }
}
