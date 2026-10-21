/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Public library API of the properties panel (inspector; re-exported by src/index.ts): the sections of MuseScore's
 * Properties panel for the selection of a score (InspectorListModel) as plain data, and the score changes for a
 * new property value (to be applied by the editor in one undo command).
 */

import type { Score } from '../engraving/dom/score'
import {
    AbstractInspectorModel, InspectorModelType, InspectorSectionType, MeasurementUnits, type InspectorChange,
} from './abstractinspectormodel'
import { AbstractInspectorProxyModel } from './abstractinspectorproxymodel'
import { AppearanceSettingsModel } from './general/appearance/appearancesettingsmodel'
import { GeneralSettingsModel } from './general/generalsettingsmodel'
import { InspectorListModel } from './inspectorlistmodel'
import type { InspectorValue, PropertyItem } from './propertyitem'

export type { InspectorChange } from './abstractinspectormodel'
export type { InspectorValue } from './propertyitem'
export { inspectorSelectionProperties, type InspectorSelectionProperty } from './inspectorselectionproperties'

export interface InspectorPropertyInfo {
    /** the property id (Pid) */
    pid: number
    /** the value as the UI shows it; null if undefined (different values in the selection) */
    value: InspectorValue | null
    isUndefined: boolean
    isEnabled: boolean
    isVisible: boolean
    /** the property has a style value ("Set as style") */
    isStyled: boolean
    /** differs from the default (the reset button is shown) */
    isModified: boolean
}

export interface InspectorModelInfo {
    /** identifies the model within its parent (for InspectorPropertyRef.path): the model type name, or "appearance" */
    key: string
    /** InspectorSectionType name, e.g. "SECTION_GENERAL" (sections only, else "") */
    sectionType: string
    /** InspectorModelType name, e.g. "TYPE_NOTE" ("TYPE_UNDEFINED" for sections) */
    modelType: string
    /** the translated title */
    title: string
    /** muse::ui::IconCode name, '' if none */
    icon: string
    isEmpty: boolean
    /** the model's property items by their C++ names (e.g. "isVisible", "offset") */
    properties: Record<string, InspectorPropertyInfo>
    /** further model state (availability flags, option lists, "measurementUnits": "sp" | "mm" | "") */
    flags: Record<string, unknown>
    /** sub models (proxy models: by type; General: "appearance") */
    models: InspectorModelInfo[]
    /** proxy models: the sub model to show first (InspectorModelType name) */
    defaultSubModelType: string
}

/** a property item: section type, the keys of the sub models, the property name */
export interface InspectorPropertyRef {
    section: string
    path: readonly string[]
    property: string
}

const s_listModels = new WeakMap<Score, InspectorListModel>()

function listModel(score: Score): InspectorListModel {
    let m = s_listModels.get(score)
    if (!m) {
        m = new InspectorListModel()
        s_listModels.set(score, m)
    }
    return m
}

function propertyInfo(p: PropertyItem): InspectorPropertyInfo {
    const v = p.value()
    return {
        pid: p.propertyId(), value: v === undefined ? null : v, isUndefined: p.isUndefined(), isEnabled: p.isEnabled(),
        isVisible: p.isVisible(), isStyled: p.isStyled(), isModified: p.isModified(),
    }
}

function units(u: unknown): unknown {
    return u === MeasurementUnits.UNITS_SPATIUM ? 'sp' : u === MeasurementUnits.UNITS_MM ? 'mm' : u === MeasurementUnits.UNITS_UNKNOWN ? '' : u
}

function subModels(model: AbstractInspectorModel): { key: string; model: AbstractInspectorModel }[] {
    if (model instanceof AbstractInspectorProxyModel) {
        return model.modelList().map(m => ({ key: InspectorModelType[m.modelType()], model: m }))
    }
    if (model instanceof GeneralSettingsModel) {
        return [{ key: 'appearance', model: model.appearanceSettingsModel() }]
    }
    return []
}

function modelInfo(key: string, model: AbstractInspectorModel, isSection: boolean): InspectorModelInfo {
    const properties: Record<string, InspectorPropertyInfo> = {}
    for (const [name, p] of Object.entries(model.properties())) {
        properties[name] = propertyInfo(p)
    }
    const flags = { ...model.flags() }
    if ('measurementUnits' in flags) {
        flags.measurementUnits = units(flags.measurementUnits)
    }
    return {
        key,
        sectionType: isSection ? InspectorSectionType[model.sectionType()] : '',
        modelType: InspectorModelType[model.modelType()],
        title: model.title(),
        icon: model.icon(),
        isEmpty: model.isEmpty(),
        properties,
        flags,
        models: subModels(model).map(s => modelInfo(s.key, s.model, false)),
        defaultSubModelType: model instanceof AbstractInspectorProxyModel ? InspectorModelType[model.defaultSubModelType()] : '',
    }
}

/**
 * The sections of the Properties panel for the score's current selection (without a selection: "Show" and
 * "Score appearance"), with the values of their property items. Call again after selection or score changes.
 */
export function inspectorSections(score: Score | null): InspectorModelInfo[] {
    if (!score) {
        return []
    }
    const lm = listModel(score)
    lm.updateElementList(score)
    return lm.modelList().map(m => modelInfo(InspectorSectionType[m.sectionType()], m, true))
}

function findModel(score: Score, ref: { section: string; path: readonly string[] }): AbstractInspectorModel | null {
    const lm = listModel(score)
    let model: AbstractInspectorModel | null = lm.modelList().find(m => InspectorSectionType[m.sectionType()] === ref.section) ?? null
    for (const key of ref.path) {
        model = model ? subModels(model).find(s => s.key === key)?.model ?? null : null
    }
    return model
}

function findItem(score: Score, ref: InspectorPropertyRef): PropertyItem | null {
    return findModel(score, ref)?.properties()[ref.property] ?? null
}

/**
 * The score changes for a new value of a property item (PropertyItem::setValue with the model's callback), e.g.
 * for the Visible checkbox of the General section: { section: "SECTION_GENERAL", path: [], property: "isVisible" }.
 * The values are converted to the elements' units (sp to absolute, % to factors, ...). Apply them with
 * EngravingItem.undoChangeProperty(pid, value, flags) in one undo command (see InspectorChange.command).
 * Uses the models of the last inspectorSections() call.
 */
export function inspectorPropertyChanges(score: Score, ref: InspectorPropertyRef, value: InspectorValue): InspectorChange[] {
    return findItem(score, ref)?.setValue(value) ?? []
}

/** the changes of "Reset" of a property item (EngravingItem.undoResetProperty for each change marked `reset`) */
export function inspectorPropertyResets(score: Score, ref: InspectorPropertyRef): InspectorChange[] {
    return findItem(score, ref)?.resetToDefault() ?? []
}

export type InspectorArrangeCommand = 'backwards' | 'forwards' | 'toBack' | 'toFront'

/** the changes of the "Arrange" buttons of the General > Appearance popup (stacking order, Pid.Z) */
export function inspectorArrangeChanges(score: Score, command: InspectorArrangeCommand): InspectorChange[] {
    const model = findModel(score, { section: 'SECTION_GENERAL', path: ['appearance'] })
    if (!(model instanceof AppearanceSettingsModel)) {
        return []
    }
    switch (command) {
    case 'backwards': return model.pushBackwardsInOrder()
    case 'forwards': return model.pushForwardsInOrder()
    case 'toBack': return model.pushToBackInOrder()
    case 'toFront': return model.pushToFrontInOrder()
    }
}
