/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/parts/partssettingsmodel.h/.cpp: "Score and part synchronization"
 * (linking the position/appearance/text of an element in a part to the main score, excluding it from other parts).
 */

import type { EngravingItem } from '../../engraving/dom/engravingitem'
import { Pid } from '../../engraving/dom/property'
import {
    AbstractInspectorModel, InspectorSectionType, type IElementRepositoryService, type InspectorChange,
} from '../abstractinspectormodel'
import type { PropertyItem } from '../propertyitem'

export class PartsSettingsModel extends AbstractInspectorModel {
    private readonly m_positionLinkedToMaster: PropertyItem
    private readonly m_appearanceLinkedToMaster: PropertyItem
    private readonly m_textLinkedToMaster: PropertyItem
    private readonly m_excludeFromOtherParts: PropertyItem

    private m_elementsForPartLinkingOption: EngravingItem[] = []
    private m_elementsForExcludeOption: EngravingItem[] = []
    private m_elementsForTextLinkingOption: EngravingItem[] = []

    private m_showPartLinkingOption = false
    private m_showExcludeOption = false
    private m_showTextLinkingOption = false

    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.setTitle(AbstractInspectorModel.tr('Score and part synchronization'))
        this.setSectionType(InspectorSectionType.SECTION_PARTS)

        // createProperties
        this.m_positionLinkedToMaster = this.buildPropertyItem(Pid.POSITION_LINKED_TO_MASTER, (pid, newValue) =>
            this.setPropertyValue(this.m_elementsForPartLinkingOption, pid, newValue))
        this.m_appearanceLinkedToMaster = this.buildPropertyItem(Pid.APPEARANCE_LINKED_TO_MASTER, (pid, newValue) =>
            this.setPropertyValue(this.m_elementsForPartLinkingOption, pid, newValue))
        this.m_textLinkedToMaster = this.buildPropertyItem(Pid.TEXT_LINKED_TO_MASTER, (pid, newValue) =>
            this.setPropertyValue(this.m_elementsForTextLinkingOption, pid, newValue))
        this.m_excludeFromOtherParts = this.buildPropertyItem(Pid.EXCLUDE_FROM_OTHER_PARTS, (pid, newValue) =>
            this.setPropertyValue(this.m_elementsForExcludeOption, pid, newValue))

        this.updateShowOptions()
    }

    override properties(): Record<string, PropertyItem> {
        return {
            positionLinkedToMaster: this.m_positionLinkedToMaster,
            appearanceLinkedToMaster: this.m_appearanceLinkedToMaster,
            textLinkedToMaster: this.m_textLinkedToMaster,
            excludeFromOtherParts: this.m_excludeFromOtherParts,
        }
    }

    override flags(): Record<string, unknown> {
        return {
            showPartLinkingOption: this.m_showPartLinkingOption,
            showExcludeOption: this.m_showExcludeOption,
            showTextLinkingOption: this.m_showTextLinkingOption,
            isMasterScore: this.isMasterScore(),
        }
    }

    override requestElements(): void {
        this.m_elementList = this.m_repository.takeAllElements()

        this.m_elementsForPartLinkingOption = []
        this.m_elementsForExcludeOption = []
        this.m_elementsForTextLinkingOption = []

        for (const item of this.m_elementList) {
            if (!item.score().isMaster() && !item.isLayoutBreak() && !item.isFBox()) {
                this.m_elementsForPartLinkingOption.push(item)
            }
            if (item.canBeExcludedFromOtherParts()) {
                this.m_elementsForExcludeOption.push(item)
            }
            if (item.isTextBase()) {
                this.m_elementsForTextLinkingOption.push(item)
            }
        }

        this.updateShowOptions()
    }

    override loadProperties(): void {
        this.loadPropertyItem(this.m_positionLinkedToMaster, this.m_elementsForPartLinkingOption)
        this.loadPropertyItem(this.m_appearanceLinkedToMaster, this.m_elementsForPartLinkingOption)
        this.loadPropertyItem(this.m_textLinkedToMaster, this.m_elementsForTextLinkingOption)
        this.loadPropertyItem(this.m_excludeFromOtherParts, this.m_elementsForExcludeOption)
    }

    override requestResetToDefaults(): InspectorChange[] {
        // resetProperties: the exclude option is not reset
        return [this.m_positionLinkedToMaster, this.m_appearanceLinkedToMaster, this.m_textLinkedToMaster]
            .flatMap(p => p.resetToDefault())
    }

    /** isMasterScore: the current notation is the main score */
    isMasterScore(): boolean {
        const score = this.m_repository.score()
        return score ? score.isMaster() : this.isMasterNotation()
    }

    /** updateShowPartLinkingOption, updateShowExcludeOption, updateShowTextLinkingOption */
    private updateShowOptions(): void {
        this.m_showPartLinkingOption = this.m_elementsForPartLinkingOption.length > 0
        this.m_showExcludeOption = this.m_elementsForExcludeOption.length > 0
        this.m_showTextLinkingOption = this.m_elementsForTextLinkingOption.length > 0
    }
}
