/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/inspectorlistmodel.h/.cpp: the sections of the Properties panel
 * for the current selection. Without notifications: updateElementList() is called when the panel is shown.
 */

import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { Score } from '../engraving/dom/score'
import { SelState } from '../engraving/dom/select'
import {
    AbstractInspectorModel, InspectorModelType, InspectorSectionType, type ElementKey,
} from './abstractinspectormodel'
import { AbstractInspectorProxyModel } from './abstractinspectorproxymodel'
import { GeneralSettingsModel } from './general/generalsettingsmodel'
import './inspectormodelcreator'
import { ElementRepositoryService } from './internal/elementrepositoryservice'
import { MeasuresSettingsModel } from './measures/measuressettingsmodel'
import { NotationSettingsProxyModel } from './notation/notationsettingsproxymodel'
import { PartsSettingsModel } from './parts/partssettingsmodel'
import { ScoreAppearanceSettingsModel, ScoreDisplaySettingsModel } from './score/scoredisplaysettingsmodel'
import { TextSettingsModel } from './text/textsettingsmodel'

const PERSISTENT_SECTIONS = [InspectorSectionType.SECTION_SCORE_DISPLAY, InspectorSectionType.SECTION_SCORE_APPEARANCE]

export class InspectorListModel {
    private readonly m_repository = new ElementRepositoryService()
    private m_modelList: AbstractInspectorModel[] = []
    private m_score: Score | null = null

    modelList(): readonly AbstractInspectorModel[] {
        return this.m_modelList
    }

    repository(): ElementRepositoryService {
        return this.m_repository
    }

    /** InspectorListModel::updateElementList: reads the selection of the score (null: no score) */
    updateElementList(score: Score | null): void {
        if (score !== this.m_score) {
            this.m_score = score
            this.m_repository.setScore(score)
            this.m_modelList = []
            // the repository's element list belongs to the previous score
            this.m_repository.updateElementList([], SelState.NONE)
        }
        if (!score) {
            this.setElementList([], SelState.NONE)
            return
        }
        const selection = score.selection()
        this.setElementList(selection.elements(), selection.state())
    }

    private setElementList(selectedElementList: readonly EngravingItem[], selectionState: SelState): void {
        if (!selectedElementList.length) {
            this.buildModelsForEmptySelection()
        } else {
            const keys: ElementKey[] = []
            for (const element of selectedElementList) {
                const key = AbstractInspectorModel.makeKey(element)
                if (!keys.some(k => k.type === key.type && k.subtype === key.subtype)) {
                    keys.push(key)
                }
            }
            this.buildModelsForSelectedElements(keys, selectionState === SelState.RANGE, selectedElementList)
        }
        this.m_repository.updateElementList(selectedElementList, selectionState)
        // elementsUpdated: the models reload their elements and properties (always here: the score may have changed)
        for (const model of this.m_modelList) {
            model.updateProperties()
        }
    }

    private buildModelsForEmptySelection(): void {
        if (!this.m_score) {
            this.removeUnusedModels([], false, [])
            return
        }
        this.removeUnusedModels([], false, [], PERSISTENT_SECTIONS)
        this.createModelsBySectionType(PERSISTENT_SECTIONS, [])
    }

    private buildModelsForSelectedElements(keys: readonly ElementKey[], isRangeSelection: boolean,
        selectedElementList: readonly EngravingItem[]): void {
        this.removeUnusedModels(keys, isRangeSelection, selectedElementList)
        const sectionTypes = AbstractInspectorModel.sectionTypesByElementKeys(keys, isRangeSelection, selectedElementList)
        this.createModelsBySectionType([...sectionTypes], keys)
        this.sortModels()
    }

    private createModelsBySectionType(sectionTypes: readonly InspectorSectionType[], keys: readonly ElementKey[]): void {
        for (const sectionType of sectionTypes) {
            if (sectionType === InspectorSectionType.SECTION_UNDEFINED) {
                continue
            }
            const model = this.modelBySectionType(sectionType)
            if (model) {
                if (model instanceof AbstractInspectorProxyModel) {
                    model.updateModels(keys)
                }
                continue
            }
            let newModel: AbstractInspectorModel | null = null
            switch (sectionType) {
            case InspectorSectionType.SECTION_GENERAL:
                newModel = new GeneralSettingsModel(this.m_repository)
                break
            case InspectorSectionType.SECTION_MEASURES:
                newModel = new MeasuresSettingsModel(this.m_repository)
                break
            case InspectorSectionType.SECTION_NOTATION:
                newModel = new NotationSettingsProxyModel(this.m_repository, keys)
                break
            case InspectorSectionType.SECTION_TEXT:
                newModel = new TextSettingsModel(this.m_repository)
                break
            case InspectorSectionType.SECTION_SCORE_DISPLAY:
                newModel = new ScoreDisplaySettingsModel(this.m_repository)
                break
            case InspectorSectionType.SECTION_SCORE_APPEARANCE:
                newModel = new ScoreAppearanceSettingsModel(this.m_repository)
                break
            case InspectorSectionType.SECTION_PARTS:
                newModel = new PartsSettingsModel(this.m_repository)
                break
            default:
                // TODO(port): SECTION_EMPTY_STAVES
                break
            }
            if (newModel) {
                this.m_modelList.push(newModel)
            }
        }
    }

    private removeUnusedModels(keys: readonly ElementKey[], isRangeSelection: boolean,
        selectedElementList: readonly EngravingItem[], exclusions: readonly InspectorSectionType[] = []): void {
        const allowedModelTypes = AbstractInspectorModel.modelTypesByElementKeys(keys)
        const allowedSectionTypes = AbstractInspectorModel.sectionTypesByElementKeys(keys, isRangeSelection, selectedElementList)
        this.m_modelList = this.m_modelList.filter(model => exclusions.includes(model.sectionType())
            || InspectorListModel.isModelAllowed(model, allowedModelTypes, allowedSectionTypes))
    }

    private static isModelAllowed(model: AbstractInspectorModel, allowedModelTypes: Set<InspectorModelType>,
        allowedSectionTypes: Set<InspectorSectionType>): boolean {
        const modelType = model.modelType()
        if (modelType !== InspectorModelType.TYPE_UNDEFINED && allowedModelTypes.has(modelType)) {
            return true
        }
        if (!(model instanceof AbstractInspectorProxyModel)) {
            return allowedSectionTypes.has(model.sectionType())
        }
        return model.modelList().some(m => InspectorListModel.isModelAllowed(m, allowedModelTypes, allowedSectionTypes))
    }

    private sortModels(): void {
        this.m_modelList.sort((a, b) => a.sectionType() - b.sectionType())
    }

    private modelBySectionType(sectionType: InspectorSectionType): AbstractInspectorModel | null {
        return this.m_modelList.find(m => m.sectionType() === sectionType) ?? null
    }
}
