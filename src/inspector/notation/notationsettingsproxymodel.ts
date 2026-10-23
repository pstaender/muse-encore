/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/notation/notationsettingsproxymodel.h/.cpp
 */

import { AbstractInspectorModel, InspectorSectionType, type ElementKey, type IElementRepositoryService } from '../abstractinspectormodel'
import { AbstractInspectorProxyModel } from '../abstractinspectorproxymodel'

export class NotationSettingsProxyModel extends AbstractInspectorProxyModel {
    constructor(repository: IElementRepositoryService, elementKeySet: readonly ElementKey[]) {
        super(repository)
        this.setSectionType(InspectorSectionType.SECTION_NOTATION)
        this.updateModels(elementKeySet)
    }

    protected override modelsChanged(): void {
        const models = this.modelList()
        this.setTitle(models.length === 1 ? models[0].title() : AbstractInspectorModel.tr('Notation'))
    }
}
