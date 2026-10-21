/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/score/scoredisplaysettingsmodel.h/.cpp and
 * scoreappearancesettingsmodel.h/.cpp (shown without a selection). Their checkboxes and buttons are the view
 * actions "show-invisible", "show-unprintable", "show-frames", "show-pageborders", "show-soundflags",
 * "page-settings" and "edit-style", which the app dispatches; the models only carry the titles.
 * TODO(port): "Automatically hide all empty staves" (Sid::hideEmptyStaves) and its options popup.
 */

import { AbstractInspectorModel, InspectorSectionType, type IElementRepositoryService } from '../abstractinspectormodel'
import type { PropertyItem } from '../propertyitem'

export class ScoreDisplaySettingsModel extends AbstractInspectorModel {
    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.setSectionType(InspectorSectionType.SECTION_SCORE_DISPLAY)
        this.setTitle(AbstractInspectorModel.tr('Show'))
    }

    override properties(): Record<string, PropertyItem> { return {} }
    override isEmpty(): boolean { return false }
    override requestElements(): void {}
    override loadProperties(): void {}
}

export class ScoreAppearanceSettingsModel extends AbstractInspectorModel {
    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.setSectionType(InspectorSectionType.SECTION_SCORE_APPEARANCE)
        this.setTitle(AbstractInspectorModel.tr('Score appearance'))
    }

    override properties(): Record<string, PropertyItem> { return {} }
    override isEmpty(): boolean { return false }
    override requestElements(): void {}
    override loadProperties(): void {}
}
