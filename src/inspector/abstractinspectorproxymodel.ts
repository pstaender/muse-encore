/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/abstractinspectorproxymodel.h/.cpp: a model made of sub models
 * (the notation section: one model per element type; the note: head, chord, stem, hook, beam).
 */

import {
    AbstractInspectorModel, InspectorModelType, type ElementKey, type IElementRepositoryService, type InspectorChange,
} from './abstractinspectormodel'
import type { PropertyItem } from './propertyitem'

/** InspectorModelCreator::newInspectorModel, set by inspectormodelcreator.ts (avoids an import cycle) */
export const inspectorModelFactory: {
    create: ((modelType: InspectorModelType, repository: IElementRepositoryService) => AbstractInspectorModel | null) | null
} = { create: null }

export abstract class AbstractInspectorProxyModel extends AbstractInspectorModel {
    /** by model type (a QMap in C++: ordered by the type) */
    private m_models = new Map<InspectorModelType, AbstractInspectorModel>()
    private m_defaultSubModelType = InspectorModelType.TYPE_UNDEFINED

    constructor(repository: IElementRepositoryService) {
        super(repository)
    }

    override properties(): Record<string, PropertyItem> {
        return {}
    }

    override loadProperties(): void {}

    modelList(): AbstractInspectorModel[] {
        return [...this.m_models.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1])
    }

    modelByType(type: InspectorModelType): AbstractInspectorModel | null {
        return this.m_models.get(type) ?? null
    }

    firstModel(): AbstractInspectorModel | null {
        return this.modelList()[0] ?? null
    }

    defaultSubModelType(): InspectorModelType {
        return this.m_defaultSubModelType
    }

    protected setDefaultSubModelType(t: InspectorModelType): void {
        this.m_defaultSubModelType = t
    }

    isMultiModel(): boolean {
        return this.m_models.size > 1
    }

    override requestElements(): void {
        for (const model of this.modelList()) {
            model.requestElements()
        }
    }

    override updateProperties(): void {
        for (const model of this.modelList()) {
            model.updateProperties()
        }
    }

    override requestResetToDefaults(): InspectorChange[] {
        return this.modelList().flatMap(m => m.requestResetToDefaults())
    }

    override isEmpty(): boolean {
        return this.modelList().every(m => m.isEmpty())
    }

    protected setModels(models: readonly (AbstractInspectorModel | null)[]): void {
        const keep = new Set(models)
        for (const [type, model] of [...this.m_models]) {
            if (!keep.has(model)) {
                this.m_models.delete(type)
            }
        }
        for (const model of models) {
            if (model && !this.m_models.has(model.modelType())) {
                this.m_models.set(model.modelType(), model)
            }
        }
        this.modelsChanged()
    }

    protected modelsChanged(): void {}

    updateModels(newElementKeySet: readonly ElementKey[]): void {
        const models: AbstractInspectorModel[] = []
        for (const key of newElementKeySet) {
            const modelType = AbstractInspectorModel.modelTypeByElementKey(key)
            if (modelType === InspectorModelType.TYPE_UNDEFINED) {
                continue
            }
            const model = this.modelByType(modelType) ?? inspectorModelFactory.create?.(modelType, this.m_repository) ?? null
            if (model && !models.includes(model)) {
                models.push(model)
            }
        }
        this.setModels(models)
    }
}
