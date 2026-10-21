/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/general/appearance/appearancesettingsmodel.h/.cpp
 * TODO(port): snap to grid / configure grid (notation configuration, "config-raster")
 */

import type { EngravingItem } from '../../../engraving/dom/engravingitem'
import type { Page } from '../../../engraving/dom/page'
import { Pid } from '../../../engraving/dom/property'
import { elementLessThan } from '../../../engraving/rendering/score/paint'
import { ElementType } from '../../../engraving/types/types'
import {
    AbstractInspectorModel, formatDoubleFunc, roundDouble, type IElementRepositoryService, type InspectorChange,
} from '../../abstractinspectormodel'
import type { PropertyItem } from '../../propertyitem'

const REARRANGE_ORDER_STEP = 50
const INT_MAX = 2147483647

const sortByZ = (a: EngravingItem, b: EngravingItem): number => elementLessThan(a, b) ? -1 : elementLessThan(b, a) ? 1 : 0

export class AppearanceSettingsModel extends AbstractInspectorModel {
    private m_leadingSpace!: PropertyItem
    private m_measureWidth!: PropertyItem
    private m_minimumDistance!: PropertyItem
    private m_color!: PropertyItem
    private m_arrangeOrder!: PropertyItem
    private m_offset!: PropertyItem
    private m_elementsForArrangeProperty: EngravingItem[] = []
    private m_elementsForOffsetProperty: EngravingItem[] = []
    private m_isVerticalOffsetAvailable = true

    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.createProperties()
        this.setTitle(AbstractInspectorModel.tr('Appearance'))
    }

    private createProperties(): void {
        this.m_leadingSpace = this.buildPropertyItem(Pid.LEADING_SPACE)
        this.m_measureWidth = this.buildPropertyItem(Pid.USER_STRETCH, (pid, v) => this.onPropertyValueChanged(pid, Number(v) / 100))
        this.m_minimumDistance = this.buildPropertyItem(Pid.MIN_DISTANCE)
        this.m_color = this.buildPropertyItem(Pid.COLOR)
        this.m_arrangeOrder = this.buildPropertyItem(Pid.Z, (pid, v) => this.setPropertyValue(this.m_elementsForArrangeProperty, pid, v))
        this.m_offset = this.buildPointFPropertyItem(Pid.OFFSET,
            (pid, v) => this.setPropertyValue(this.m_elementsForOffsetProperty, pid, v),
            (pid) => this.resetPropertyValue(this.m_elementsForOffsetProperty, pid))
    }

    override properties(): Record<string, PropertyItem> {
        return {
            leadingSpace: this.m_leadingSpace, measureWidth: this.m_measureWidth, minimumDistance: this.m_minimumDistance,
            color: this.m_color, arrangeOrder: this.m_arrangeOrder, offset: this.m_offset,
        }
    }

    override flags(): Record<string, unknown> {
        return { isVerticalOffsetAvailable: this.m_isVerticalOffsetAvailable, measurementUnits: this.m_measurementUnits }
    }

    override requestElements(): void {
        this.m_elementList = this.m_repository.takeAllElements().filter(e => e.type() !== ElementType.SOUND_FLAG)
        this.m_elementsForArrangeProperty = this.m_elementList.filter(e => e.findAncestor(ElementType.PAGE))
        const offsetElements = new Set<EngravingItem>()
        for (const element of this.m_elementList) {
            const t = element.type()
            if (t !== ElementType.NOTE && t !== ElementType.STEM && t !== ElementType.HOOK) {
                offsetElements.add(element)
                continue
            }
            const parent = element.parentItem()
            if (parent && parent.isChord()) {
                offsetElements.add(parent)
            }
        }
        this.m_elementsForOffsetProperty = [...offsetElements]
    }

    override loadProperties(): void {
        this.loadPropertyItem(this.m_leadingSpace, formatDoubleFunc)
        this.loadPropertyItem(this.m_measureWidth, (v) => roundDouble(Number(v)) * 100)
        this.loadPropertyItem(this.m_minimumDistance, formatDoubleFunc)
        this.loadPropertyItem(this.m_color)
        this.loadPropertyItem(this.m_arrangeOrder, this.m_elementsForArrangeProperty)
        this.loadPropertyItem(this.m_offset, this.m_elementsForOffsetProperty)
        this.m_isVerticalOffsetAvailable = !this.m_elementList.some(e => e.isBeam())
        this.updatemeasurementUnits()
    }

    // ---- arrange (stacking order) ----

    private page(): Page {
        return this.m_elementsForArrangeProperty[0].findAncestor(ElementType.PAGE) as unknown as Page
    }

    private allOverlappingElements(): EngravingItem[] {
        let bbox = this.m_elementsForArrangeProperty[0].pageBoundingRect()
        for (const e of this.m_elementsForArrangeProperty) {
            bbox = bbox.united(e.pageBoundingRect())
        }
        if (bbox.width() === 0 || bbox.height() === 0) {
            return this.page().elements()
        }
        return this.page().items(bbox)
    }

    pushBackwardsInOrder(): InspectorChange[] {
        if (!this.m_elementsForArrangeProperty.length) {
            return []
        }
        const elements = this.allOverlappingElements().sort(sortByZ)
        const minZ = [...this.m_elementsForArrangeProperty].sort(sortByZ)[0].z()
        let i = elements.findIndex(e => e.z() === minZ)
        i = i < 0 ? elements.length : i
        const behindZ = elements[i - 1 >= 0 ? i - 1 : 0].z()
        return this.m_arrangeOrder.setValue(behindZ <= -INT_MAX + REARRANGE_ORDER_STEP ? behindZ : behindZ - REARRANGE_ORDER_STEP)
    }

    pushForwardsInOrder(): InspectorChange[] {
        if (!this.m_elementsForArrangeProperty.length) {
            return []
        }
        const elements = this.allOverlappingElements().sort(sortByZ)
        const sorted = [...this.m_elementsForArrangeProperty].sort(sortByZ)
        const maxZ = sorted[sorted.length - 1].z()
        const n = elements.length
        let i = n - 1
        for (; i > 0; i--) {
            if (elements[i].z() === maxZ) {
                break
            }
        }
        const frontZ = elements[i + 1 < n ? i + 1 : n - 1].z()
        return this.m_arrangeOrder.setValue(frontZ >= INT_MAX - REARRANGE_ORDER_STEP ? frontZ : frontZ + REARRANGE_ORDER_STEP)
    }

    pushToBackInOrder(): InspectorChange[] {
        if (!this.m_elementsForArrangeProperty.length) {
            return []
        }
        // elements with z -INT_MAX (TimeTickAnchor) are always at the back and not taken into account
        const elements = this.page().elements().filter(e => e.z() !== -INT_MAX).sort(sortByZ)
        const minElement = elements[0]
        if (!minElement) {
            return []
        }
        if (this.m_elementsForArrangeProperty.includes(minElement)) {
            return this.m_arrangeOrder.setValue(minElement.z())
        }
        const z = minElement.z()
        return this.m_arrangeOrder.setValue(z <= -INT_MAX + REARRANGE_ORDER_STEP ? z : z - REARRANGE_ORDER_STEP)
    }

    pushToFrontInOrder(): InspectorChange[] {
        if (!this.m_elementsForArrangeProperty.length) {
            return []
        }
        // elements with z INT_MAX (SoundFlag) are always at the front and not taken into account
        const elements = this.page().elements().filter(e => e.z() !== INT_MAX).sort(sortByZ)
        const maxElement = elements[elements.length - 1]
        if (!maxElement) {
            return []
        }
        if (this.m_elementsForArrangeProperty.includes(maxElement)) {
            return this.m_arrangeOrder.setValue(maxElement.z())
        }
        const z = maxElement.z()
        return this.m_arrangeOrder.setValue(z >= INT_MAX - REARRANGE_ORDER_STEP ? z : z + REARRANGE_ORDER_STEP)
    }
}
