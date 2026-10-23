/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/indicatoricon.h/.cpp and of SystemLockIndicator (src/engraving/dom/systemlock.h/.cpp; in
 * this file because systemlock.ts is loaded with the Score, before the element classes)
 */

import { RectF } from '../../framework/draw/types/geometry'
import { Font, FontType } from '../../framework/draw/types/font'
import { arg, mtrc } from '../../framework/global/translation'
import { ElementType } from '../types/types'
import { EngravingConfiguration } from '../internal/engravingconfiguration'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import { scoreRendererHooks } from './score'
import type { PropertyValue } from '../types/propertyvalue'
import type { Pid } from './property'
import type { PropertyFlags } from './property'
import type { System } from './system'
import type { SystemLock } from './systemlock'

/** C++ mscore.h UI_ICONS_DEFAULT_FONT_SIZE */
const UI_ICONS_DEFAULT_FONT_SIZE = 12.0

export class IndicatorIconLayoutData extends LayoutData {
    rangeRect = new RectF()
}

export class IndicatorIcon extends EngravingItem {
    constructor(type: ElementType, parent: System | null = null, flags: number = ElementFlag.NOTHING) {
        super(type, parent, flags)
    }

    system(): System { return this.explicitParent() as unknown as System }

    protected override createLayoutData(): IndicatorIconLayoutData { return new IndicatorIconLayoutData(this) }
    override ldata(): IndicatorIconLayoutData { return super.ldata() as IndicatorIconLayoutData }
    override mutldata(): IndicatorIconLayoutData { return super.ldata() as IndicatorIconLayoutData }

    font(): Font {
        const font = new Font(EngravingConfiguration.iconsFontFamily(), FontType.Icon)
        font.setPointSizeF(UI_ICONS_DEFAULT_FONT_SIZE * this.magS())
        return font
    }

    iconCode(): number { return 0x000 }

    override undoChangeProperty(_id: Pid, _v: PropertyValue, _ps?: PropertyFlags): void {} // not editable
}

export class SystemLockIndicator extends IndicatorIcon {
    constructor(parent: System, private m_systemLock: SystemLock) {
        super(ElementType.SYSTEM_LOCK_INDICATOR, parent, ElementFlag.SYSTEM | ElementFlag.GENERATED)
    }

    override setSelected(v: boolean): void {
        super.setSelected(v)
        scoreRendererHooks.layoutItem!(this) // (the port's pages have no bsp tree to invalidate)
    }

    systemLock(): SystemLock { return this.m_systemLock }

    override iconCode(): number { return 0xF487 }

    override formatBarsAndBeats(): string {
        const startMeas = this.systemLock().startMB().no() + 1
        const endMeas = this.systemLock().endMB().no() + 1
        return arg(mtrc('engraving', 'Start measure: %1; End measure: %2'), startMeas, endMeas)
    }
}
