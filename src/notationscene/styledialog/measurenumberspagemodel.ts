/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/measurenumberspagemodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'
import { Notification } from '../../notation/internal/notationundostack'
import { TextStyleType } from '../../engraving/types/types'
import { TConv } from '../../engraving/types/typesconv'
import { TextStylePropertyType, allTextStyles, textStyle } from '../../engraving/style/textstyle'

export class MeasureNumbersPageModel extends AbstractStyleDialogModel {
    private m_measureNumberPosAboveChanged = new Notification()

    constructor(style: NotationStyle) {
        super(style, [
            Sid.showMeasureNumber,
            Sid.showMeasureNumberOne,
            Sid.measureNumberInterval,
            Sid.measureNumberSystem,
            Sid.measureNumberVPlacement,
            Sid.measureNumberHPlacement,
            Sid.measureNumberPlacementMode,
            Sid.measureNumberPosAbove,
            Sid.measureNumberPosBelow,
            Sid.measureNumberAlternatePosBelow,
            Sid.measureNumberAlignToBarline,
            Sid.mmRestShowMeasureNumberRange,
            Sid.mmRestRangeBracketType,
            Sid.mmRestRangePosAbove,
            Sid.mmRestRangePosBelow,
            Sid.mmRestRangeVPlacement,
            Sid.mmRestRangeHPlacement,
            Sid.measureNumberTextStyle,
            Sid.mmRestRangeTextStyle,
        ])
        for (const textStyleType of allTextStyles()) {
            const style = textStyle(textStyleType)!
            const offsetPropertyIdx = TextStylePropertyType.Offset - 1
            this.addStyleId(style[offsetPropertyIdx].sid)
        }
    }

    showMeasureNumber(): StyleItem { return this.styleItem(Sid.showMeasureNumber) }
    showMeasureNumberOne(): StyleItem { return this.styleItem(Sid.showMeasureNumberOne) }
    measureNumberInterval(): StyleItem { return this.styleItem(Sid.measureNumberInterval) }
    measureNumberSystem(): StyleItem { return this.styleItem(Sid.measureNumberSystem) }
    measureNumberVPlacement(): StyleItem { return this.styleItem(Sid.measureNumberVPlacement) }
    measureNumberHPlacement(): StyleItem { return this.styleItem(Sid.measureNumberHPlacement) }
    measureNumberPlacementMode(): StyleItem { return this.styleItem(Sid.measureNumberPlacementMode) }
    measureNumberAlignToBarline(): StyleItem { return this.styleItem(Sid.measureNumberAlignToBarline) }
    mmRestShowMeasureNumberRange(): StyleItem { return this.styleItem(Sid.mmRestShowMeasureNumberRange) }
    mmRestRangeBracketType(): StyleItem { return this.styleItem(Sid.mmRestRangeBracketType) }
    mmRestRangePosAbove(): StyleItem { return this.styleItem(Sid.mmRestRangePosAbove) }
    mmRestRangePosBelow(): StyleItem { return this.styleItem(Sid.mmRestRangePosBelow) }
    mmRestRangeVPlacement(): StyleItem { return this.styleItem(Sid.mmRestRangeVPlacement) }
    mmRestRangeHPlacement(): StyleItem { return this.styleItem(Sid.mmRestRangeHPlacement) }
    measureNumberTextStyle(): StyleItem { return this.styleItem(Sid.measureNumberTextStyle) }
    mmRestRangeTextStyle(): StyleItem { return this.styleItem(Sid.mmRestRangeTextStyle) }

    measureNumberPosAbove(): StyleItem {
        const textStyleType = this.styleItem(Sid.measureNumberTextStyle).value() as TextStyleType
        const ts = textStyle(textStyleType)!
        const offsetPropertyIdx = TextStylePropertyType.Offset - 1
        return this.styleItem(ts[offsetPropertyIdx].sid)
    }

    measureNumberPosBelow(): StyleItem {
        const textStyleType = this.styleItem(Sid.measureNumberTextStyle).value() as TextStyleType
        return textStyleType === TextStyleType.MEASURE_NUMBER_ALTERNATE
            ? this.styleItem(Sid.measureNumberAlternatePosBelow)
            : this.styleItem(Sid.measureNumberPosBelow)
    }

    /** the signal measureNumberPosAboveChanged: the text style of measure numbers changed */
    measureNumberPosAboveChanged(): Notification { return this.m_measureNumberPosAboveChanged }

    protected override buildStyleItem(id: Sid): StyleItem {
        const item = super.buildStyleItem(id)
        if (id === Sid.measureNumberTextStyle) {
            item.valueChanged().onNotify(() => this.m_measureNumberPosAboveChanged.notify())
        }
        return item
    }

    textStyles(): { text: string; value: number }[] {
        const textStyles: { text: string; value: number }[] = []
        for (const type of allTextStyles()) {
            textStyles.push({ text: TConv.userNameTextStyleType(type).translated(), value: type })
        }
        return textStyles
    }
}
