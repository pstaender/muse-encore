/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/general/generalsettingsmodel.h/.cpp
 * TODO(port): PlaybackProxyModel (the "Playback" popup)
 */

import type { EngravingItem } from '../../engraving/dom/engravingitem'
import type { FretDiagram } from '../../engraving/dom/fret'
import type { Harmony } from '../../engraving/dom/harmony'
import type { Note } from '../../engraving/dom/note'
import { Pid } from '../../engraving/dom/property'
import { ElementType } from '../../engraving/types/types'
import {
    AbstractInspectorModel, InspectorSectionType, type IElementRepositoryService, type InspectorChange,
} from '../abstractinspectormodel'
import type { PropertyItem } from '../propertyitem'
import { AppearanceSettingsModel } from './appearance/appearancesettingsmodel'

export class GeneralSettingsModel extends AbstractInspectorModel {
    private m_isVisible!: PropertyItem
    private m_isSmall!: PropertyItem
    private m_isAutoPlaceAllowed!: PropertyItem
    private m_isPlayable!: PropertyItem
    private m_elementsForIsSmallProperty: EngravingItem[] = []
    private m_elementsForIsVisibleProperty: EngravingItem[] = []
    private m_elementsForIsAutoPlaceProperty: EngravingItem[] = []
    private m_elementsForIsPlayableProperty: EngravingItem[] = []
    private m_areGeneralPropertiesAvailable = true
    private readonly m_appearanceSettingsModel: AppearanceSettingsModel

    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.createProperties()
        this.setTitle(AbstractInspectorModel.tr('General'))
        this.setSectionType(InspectorSectionType.SECTION_GENERAL)
        this.m_appearanceSettingsModel = new AppearanceSettingsModel(repository)
    }

    private createProperties(): void {
        this.m_isVisible = this.buildPropertyItem(Pid.VISIBLE, (_pid, v) => this.onVisibleChanged(!!v))
        this.m_isSmall = this.buildPropertyItem(Pid.SMALL, (pid, v) => this.setPropertyValue(this.m_elementsForIsSmallProperty, pid, v))
        this.m_isAutoPlaceAllowed = this.buildPropertyItem(Pid.AUTOPLACE)
        this.m_isPlayable = this.buildPropertyItem(Pid.PLAY)
    }

    override properties(): Record<string, PropertyItem> {
        return {
            isVisible: this.m_isVisible, isSmall: this.m_isSmall, isAutoPlaceAllowed: this.m_isAutoPlaceAllowed,
            isPlayable: this.m_isPlayable,
        }
    }

    override flags(): Record<string, unknown> {
        return { areGeneralPropertiesAvailable: this.m_areGeneralPropertiesAvailable }
    }

    appearanceSettingsModel(): AppearanceSettingsModel {
        return this.m_appearanceSettingsModel
    }

    override requestElements(): void {
        this.m_elementList = this.m_repository.takeAllElements()
        const small = new Set<EngravingItem>()
        const visible = new Set<EngravingItem>()
        for (const element of this.m_elementList) {
            if (element.isHarmony() && (element as unknown as Harmony).isInFretBox()) {
                continue
            }
            if (element.isFretDiagram() && (element as unknown as FretDiagram).isInFretBox()) {
                continue
            }
            // Trill cue note is small by definition, so isSmall property does not apply
            if (element.isNote() && (element as unknown as Note).isTrillCueNote()) {
                continue
            }
            small.add(element.findAncestor(ElementType.CHORD) ?? element)
            visible.add(element)
        }
        this.m_elementsForIsSmallProperty = [...small]
        this.m_elementsForIsVisibleProperty = [...visible]
        this.m_elementsForIsAutoPlaceProperty = [...visible]
        this.m_elementsForIsPlayableProperty = [...visible]
    }

    override updateProperties(): void {
        super.updateProperties()
        this.m_appearanceSettingsModel.updateProperties()
    }

    override loadProperties(): void {
        this.loadPropertyItem(this.m_isVisible, this.m_elementsForIsVisibleProperty)
        this.loadPropertyItem(this.m_isAutoPlaceAllowed, this.m_elementsForIsAutoPlaceProperty)
        const isMaster = this.isMasterNotation()
        this.m_isPlayable.setIsVisible(isMaster)
        if (isMaster) {
            this.loadPropertyItem(this.m_isPlayable, this.m_elementsForIsPlayableProperty)
        }
        this.loadPropertyItem(this.m_isSmall, this.m_elementsForIsSmallProperty)
        this.updateAreGeneralPropertiesAvailable()
    }

    /** GeneralSettingsModel::onVisibleChanged: Score::undoChangeVisible for each element */
    private onVisibleChanged(visible: boolean): InspectorChange[] {
        return this.m_elementList.map(item => ({ item, pid: Pid.VISIBLE, value: visible, command: 'changeVisible' as const }))
    }

    private updateAreGeneralPropertiesAvailable(): void {
        this.m_areGeneralPropertiesAvailable = !this.m_elementList.some(item =>
            item.type() === ElementType.LAYOUT_BREAK || item.type() === ElementType.SYSTEM_LOCK_INDICATOR)
    }
}
