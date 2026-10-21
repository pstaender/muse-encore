/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/notation/notes/notesettingsproxymodel.h/.cpp and the note's sub
 * models (notes/noteheads/noteheadsettingsmodel, notes/chords/chordsettingsmodel, notes/stems/stemsettingsmodel,
 * notes/hooks/hooksettingsmodel, notes/beams/beamsettingsmodel, beams/beammodesmodel).
 */

import type { Beam } from '../../../engraving/dom/beam'
import type { Chord } from '../../../engraving/dom/chord'
import type { EngravingItem } from '../../../engraving/dom/engravingitem'
import type { Note } from '../../../engraving/dom/note'
import { Pid } from '../../../engraving/dom/property'
import type { Stem } from '../../../engraving/dom/stem'
import { Sid } from '../../../engraving/style/styledef'
import { DurationType, ElementType, NoteHeadGroup, NoteHeadScheme } from '../../../engraving/types/types'
import { TConv } from '../../../engraving/types/typesconv'
import { NOTEHEAD_SCHEMES } from '../../../engraving/types/typesconvdata'
import { TranslatableString } from '../../../framework/global/types/translatablestring'
import {
    AbstractInspectorModel, formatDoubleFunc, InspectorModelType, type IElementRepositoryService, type InspectorChange,
} from '../../abstractinspectormodel'
import { AbstractInspectorProxyModel } from '../../abstractinspectorproxymodel'
import type { InspectorValue, PropertyItem } from '../../propertyitem'

const tr = (key: string, disambiguation = ''): string => AbstractInspectorModel['tr'](key, disambiguation)

// ---------------------------------------------------------------------------------------------------------------------
//   NoteheadSettingsModel
// ---------------------------------------------------------------------------------------------------------------------

export class NoteheadSettingsModel extends AbstractInspectorModel {
    private m_isHeadHidden!: PropertyItem
    private m_isHeadSmall!: PropertyItem
    private m_hasHeadParentheses!: PropertyItem
    private m_headDirection!: PropertyItem
    private m_headGroup!: PropertyItem
    private m_headType!: PropertyItem
    private m_headSystem!: PropertyItem
    private m_dotPosition!: PropertyItem
    private m_offset!: PropertyItem
    private m_isTrillCueNote = false

    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.setTitle(tr('Head'))
        this.setModelType(InspectorModelType.TYPE_NOTEHEAD)
        this.createProperties()
    }

    private createProperties(): void {
        this.m_isHeadHidden = this.buildPropertyItem(Pid.VISIBLE, (pid, hidden) => this.onPropertyValueChanged(pid, !hidden))
        this.m_isHeadSmall = this.buildPropertyItem(Pid.SMALL)
        // Score::cmdAddParenthesesToNotes / cmdRemoveParenthesesFromNotes on the selection
        this.m_hasHeadParentheses = this.buildPropertyItem(Pid.HAS_PARENTHESES, (pid, hasParens) => this.m_elementList.map(item => ({
            item, pid, value: hasParens, command: hasParens ? 'addParentheses' as const : 'removeParentheses' as const,
        })))
        this.m_headDirection = this.buildPropertyItem(Pid.MIRROR_HEAD)
        this.m_headGroup = this.buildPropertyItem(Pid.HEAD_GROUP)
        this.m_headType = this.buildPropertyItem(Pid.HEAD_TYPE)
        this.m_headSystem = this.buildPropertyItem(Pid.HEAD_SCHEME)
        this.m_dotPosition = this.buildPropertyItem(Pid.DOT_POSITION)
        this.m_offset = this.buildPointFPropertyItem(Pid.OFFSET)
    }

    override properties(): Record<string, PropertyItem> {
        return {
            isHeadHidden: this.m_isHeadHidden, isHeadSmall: this.m_isHeadSmall, hasHeadParentheses: this.m_hasHeadParentheses,
            headDirection: this.m_headDirection, headGroup: this.m_headGroup, headType: this.m_headType,
            headSystem: this.m_headSystem, dotPosition: this.m_dotPosition, offset: this.m_offset,
        }
    }

    override flags(): Record<string, unknown> {
        return {
            isTrillCueNote: this.m_isTrillCueNote, measurementUnits: this.m_measurementUnits,
            possibleHeadSystemTypes: this.possibleHeadSystemTypes(), noteheadGroups: this.noteheadGroups(),
        }
    }

    /** NoteheadSettingsModel::possibleHeadSystemTypes */
    possibleHeadSystemTypes(): { value: number; text: string }[] {
        // TConv::translatedUserName(NoteHeadScheme)
        return NOTEHEAD_SCHEMES.filter(i => i.type < NoteHeadScheme.HEAD_SCHEMES)
            .map(i => ({ value: i.type, text: TranslatableString.from(i.tCapitalizedUserName).translated() }))
    }

    /** NoteheadGroupsModel: the notehead groups shown in the selector (all before HEAD_DO_WALKER) */
    noteheadGroups(): { value: number; text: string }[] {
        const result: { value: number; text: string }[] = []
        for (let g = 0; g < NoteHeadGroup.HEAD_DO_WALKER; ++g) {
            result.push({ value: g, text: TConv.userNameNoteHeadGroup(g).translated() })
        }
        return result
    }

    override requestElements(): void {
        this.m_elementList = this.m_repository.findElementsByType(ElementType.NOTEHEAD)
    }

    override loadProperties(): void {
        this.loadPropertyItem(this.m_isHeadHidden, (v) => !v)
        this.loadPropertyItem(this.m_isHeadSmall)
        this.loadPropertyItem(this.m_hasHeadParentheses)
        this.loadPropertyItem(this.m_headDirection)
        this.loadPropertyItem(this.m_headGroup)
        this.loadPropertyItem(this.m_headType)
        this.loadPropertyItem(this.m_headSystem)
        this.loadPropertyItem(this.m_dotPosition)
        this.loadPropertyItem(this.m_offset)
        this.m_isTrillCueNote = this.m_elementList.some(e => e.isNote() && (e as unknown as Note).isTrillCueNote())
        this.updatemeasurementUnits()
    }
}

// ---------------------------------------------------------------------------------------------------------------------
//   ChordSettingsModel
// ---------------------------------------------------------------------------------------------------------------------

export class ChordSettingsModel extends AbstractInspectorModel {
    private m_isStemless!: PropertyItem
    private m_combineVoice!: PropertyItem
    private m_showStemSlash!: PropertyItem
    private m_showStemSlashVisible = false
    private m_showStemSlashEnabled = false

    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.setModelType(InspectorModelType.TYPE_CHORD)
        this.setTitle(tr('Chord'))
        this.m_isStemless = this.buildPropertyItem(Pid.NO_STEM)
        this.m_combineVoice = this.buildPropertyItem(Pid.COMBINE_VOICE)
        this.m_showStemSlash = this.buildPropertyItem(Pid.SHOW_STEM_SLASH)
    }

    override properties(): Record<string, PropertyItem> {
        return { isStemless: this.m_isStemless, combineVoice: this.m_combineVoice, showStemSlash: this.m_showStemSlash }
    }

    override flags(): Record<string, unknown> {
        return { showStemSlashVisible: this.m_showStemSlashVisible, showStemSlashEnabled: this.m_showStemSlashEnabled }
    }

    override requestElements(): void {
        this.m_elementList = this.m_repository.findElementsByType(ElementType.CHORD)
    }

    override loadProperties(): void {
        this.loadPropertyItem(this.m_isStemless)
        this.loadPropertyItem(this.m_showStemSlash)
        this.loadPropertyItem(this.m_combineVoice)
        const chords = this.m_elementList.map(e => e.elementBase()).filter(e => e.isChord()) as unknown as Chord[]
        this.m_showStemSlashVisible = chords.some(c => c.isGrace())
        this.m_showStemSlashEnabled = chords.some(c => !c.noStem())
    }
}

// ---------------------------------------------------------------------------------------------------------------------
//   StemSettingsModel
// ---------------------------------------------------------------------------------------------------------------------

export class StemSettingsModel extends AbstractInspectorModel {
    private m_thickness!: PropertyItem
    private m_length!: PropertyItem
    private m_stemDirection!: PropertyItem
    private m_offset!: PropertyItem

    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.setModelType(InspectorModelType.TYPE_STEM)
        this.setTitle(tr('Stem'))
        this.m_thickness = this.buildPropertyItem(Pid.LINE_WIDTH)
        this.m_length = this.buildPropertyItem(Pid.USER_LEN)
        this.m_stemDirection = this.buildPropertyItem(Pid.STEM_DIRECTION, (_pid, v) => this.onStemDirectionChanged(v))
        this.m_offset = this.buildPointFPropertyItem(Pid.OFFSET)
    }

    override properties(): Record<string, PropertyItem> {
        return { thickness: this.m_thickness, length: this.m_length, stemDirection: this.m_stemDirection, offset: this.m_offset }
    }

    override flags(): Record<string, unknown> {
        return { useStraightNoteFlags: this.useStraightNoteFlags(), measurementUnits: this.m_measurementUnits }
    }

    /** a style value: the style changes TODO(port) (updateStyleValue needs the undo stack) */
    useStraightNoteFlags(): boolean {
        return this.m_repository.score()?.style().styleB(Sid.useStraightNoteFlags) ?? false
    }

    override requestElements(): void {
        this.m_elementList = this.m_repository.findElementsByType(ElementType.STEM)
    }

    override loadProperties(): void {
        this.loadPropertyItem(this.m_thickness, formatDoubleFunc)
        this.loadPropertyItem(this.m_length, formatDoubleFunc)
        this.loadPropertyItem(this.m_stemDirection)
        this.loadPropertyItem(this.m_offset)
        this.updatemeasurementUnits()
    }

    /** the direction is set on the beam if the chord is beamed */
    private onStemDirectionChanged(newDirection: InspectorValue): InspectorChange[] {
        const changes: InspectorChange[] = []
        for (const element of this.m_elementList) {
            const stem = element as unknown as Stem
            const beam = stem.chord()?.beam() as unknown as EngravingItem | null
            const root = beam ?? element
            changes.push({ item: root, pid: Pid.STEM_DIRECTION, value: Number(newDirection), flags: root.propertyFlags(Pid.STEM_DIRECTION) })
        }
        return changes
    }
}

// ---------------------------------------------------------------------------------------------------------------------
//   HookSettingsModel
// ---------------------------------------------------------------------------------------------------------------------

export class HookSettingsModel extends AbstractInspectorModel {
    private readonly m_offset: PropertyItem

    constructor(repository: IElementRepositoryService) {
        super(repository, ElementType.HOOK)
        this.setModelType(InspectorModelType.TYPE_HOOK)
        // internally called "Hook", but "Flag" in SMuFL, so here externally too
        this.setTitle(tr('Flag'))
        this.m_offset = this.buildPointFPropertyItem(Pid.OFFSET)
    }

    override properties(): Record<string, PropertyItem> {
        return { offset: this.m_offset }
    }

    override flags(): Record<string, unknown> {
        return { measurementUnits: this.m_measurementUnits }
    }

    override loadProperties(): void {
        this.loadPropertyItem(this.m_offset)
        this.updatemeasurementUnits()
    }
}

// ---------------------------------------------------------------------------------------------------------------------
//   BeamModesModel, BeamSettingsModel
// ---------------------------------------------------------------------------------------------------------------------

/** BeamTypes::FeatheringMode */
export enum FeatheringMode {
    FEATHERING_NONE = 0,
    FEATHERED_DECELERATE,
    FEATHERED_ACCELERATE,
}

export class BeamModesModel extends AbstractInspectorModel {
    private readonly m_mode: PropertyItem
    private readonly m_isFeatheringAvailable: PropertyItem

    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.setTitle(tr('Beam types'))
        this.m_mode = this.buildPropertyItem(Pid.BEAM_MODE)
        // a read-only property
        this.m_isFeatheringAvailable = this.buildPropertyItem(Pid.DURATION_TYPE_WITH_DOTS, () => [])
    }

    override properties(): Record<string, PropertyItem> {
        return { mode: this.m_mode, isFeatheringAvailable: this.m_isFeatheringAvailable }
    }

    override requestElements(): void {
        this.m_elementList = [...this.m_repository.findElementsByType(ElementType.CHORD), ...this.m_repository.findElementsByType(ElementType.REST)]
    }

    override loadProperties(): void {
        this.loadPropertyItem(this.m_mode)
        // DURATION_TYPE_WITH_DOTS: feathering only for durations shorter than an eighth
        this.m_isFeatheringAvailable.setIsEnabled(this.m_elementList.length > 0)
        let value: boolean | undefined
        let undefinedValue = false
        for (const e of this.m_elementList) {
            const d = e.getProperty(Pid.DURATION_TYPE_WITH_DOTS) as { type: DurationType } | undefined
            const v = !!d && d.type > DurationType.V_EIGHTH && d.type !== DurationType.V_INVALID
                && d.type !== DurationType.V_MEASURE && d.type !== DurationType.V_ZERO
            if (value === undefined) {
                value = v
            } else if (value !== v) {
                undefinedValue = true
            }
        }
        this.m_isFeatheringAvailable.updateCurrentValue(undefinedValue ? undefined : value ?? false)
    }
}

export class BeamSettingsModel extends AbstractInspectorModel {
    private readonly m_beamModesModel: BeamModesModel
    private m_featheringHeightLeft!: PropertyItem
    private m_featheringHeightRight!: PropertyItem
    private m_isBeamHidden!: PropertyItem
    private m_beamHeightLeft!: PropertyItem
    private m_beamHeightRight!: PropertyItem
    private m_forceHorizontal!: PropertyItem
    private m_customPositioned!: PropertyItem
    private m_stemDirection!: PropertyItem
    private m_crossStaffMove!: PropertyItem
    private m_featheringMode = FeatheringMode.FEATHERING_NONE
    private m_isCrossStaffMoveAvailable = false

    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.setModelType(InspectorModelType.TYPE_BEAM)
        this.setTitle(tr('Beam'))
        this.m_beamModesModel = new BeamModesModel(repository)
        this.createProperties()
    }

    private createProperties(): void {
        this.m_featheringHeightLeft = this.buildPropertyItem(Pid.GROW_LEFT)
        this.m_featheringHeightRight = this.buildPropertyItem(Pid.GROW_RIGHT)
        this.m_isBeamHidden = this.buildPropertyItem(Pid.VISIBLE, (pid, hidden) => this.onPropertyValueChanged(pid, !hidden))
        // TODO(port): setBeamHeightLeft/Right (BEAM_POS pair with the height lock)
        this.m_beamHeightLeft = this.buildPropertyItem(Pid.BEAM_POS, () => [])
        this.m_beamHeightRight = this.buildPropertyItem(Pid.BEAM_POS, () => [])
        this.m_forceHorizontal = this.buildPropertyItem(Pid.BEAM_NO_SLOPE)
        this.m_customPositioned = this.buildPropertyItem(Pid.USER_MODIFIED)
        this.m_stemDirection = this.buildPropertyItem(Pid.STEM_DIRECTION)
        this.m_crossStaffMove = this.buildPropertyItem(Pid.BEAM_CROSS_STAFF_MOVE)
    }

    beamModesModel(): BeamModesModel {
        return this.m_beamModesModel
    }

    override properties(): Record<string, PropertyItem> {
        return {
            featheringHeightLeft: this.m_featheringHeightLeft, featheringHeightRight: this.m_featheringHeightRight,
            isBeamHidden: this.m_isBeamHidden, beamHeightLeft: this.m_beamHeightLeft, beamHeightRight: this.m_beamHeightRight,
            forceHorizontal: this.m_forceHorizontal, customPositioned: this.m_customPositioned,
            stemDirection: this.m_stemDirection, crossStaffMove: this.m_crossStaffMove,
            // BeamModesModel's items (QML: model.beamModesModel.mode)
            mode: this.m_beamModesModel.properties().mode,
            isFeatheringAvailable: this.m_beamModesModel.properties().isFeatheringAvailable,
        }
    }

    override flags(): Record<string, unknown> {
        return {
            featheringMode: this.m_featheringMode,
            isFeatheringHeightChangingAllowed: this.m_featheringMode !== FeatheringMode.FEATHERING_NONE,
            isCrossStaffMoveAvailable: this.m_isCrossStaffMoveAvailable,
            isBeamModesEmpty: this.m_beamModesModel.isEmpty(),
        }
    }

    override requestElements(): void {
        this.m_elementList = this.m_repository.findElementsByType(ElementType.BEAM)
    }

    override updateProperties(): void {
        super.updateProperties()
        this.m_beamModesModel.updateProperties()
    }

    override loadProperties(): void {
        this.loadPropertyItem(this.m_isBeamHidden, (v) => !v)
        this.loadPropertyItem(this.m_featheringHeightLeft, formatDoubleFunc)
        this.loadPropertyItem(this.m_featheringHeightRight, formatDoubleFunc)
        this.loadPropertyItem(this.m_beamHeightLeft, (v) => Array.isArray(v) ? Math.round(v[0] * 100) / 100 : undefined)
        this.loadPropertyItem(this.m_beamHeightRight, (v) => Array.isArray(v) ? Math.round(v[1] * 100) / 100 : undefined)
        this.loadPropertyItem(this.m_forceHorizontal)
        this.loadPropertyItem(this.m_customPositioned)
        const left = this.m_featheringHeightLeft.value()
        const right = this.m_featheringHeightRight.value()
        if (left !== undefined && right !== undefined) {
            this.m_featheringMode = left !== right
                ? (Number(left) > Number(right) ? FeatheringMode.FEATHERED_DECELERATE : FeatheringMode.FEATHERED_ACCELERATE)
                : FeatheringMode.FEATHERING_NONE
        }
        this.loadPropertyItem(this.m_stemDirection)
        this.loadPropertyItem(this.m_crossStaffMove)
        this.m_isCrossStaffMoveAvailable = this.m_elementList.some(e => (e as unknown as Beam).cross?.() ?? false)
    }
}

// ---------------------------------------------------------------------------------------------------------------------
//   NoteSettingsProxyModel
// ---------------------------------------------------------------------------------------------------------------------

const NOTE_PART_TYPES = new Map<ElementType, InspectorModelType>([
    [ElementType.NOTEHEAD, InspectorModelType.TYPE_NOTEHEAD],
    [ElementType.CHORD, InspectorModelType.TYPE_CHORD],
    [ElementType.STEM, InspectorModelType.TYPE_STEM],
    [ElementType.BEAM, InspectorModelType.TYPE_BEAM],
    [ElementType.HOOK, InspectorModelType.TYPE_HOOK],
])

export class NoteSettingsProxyModel extends AbstractInspectorProxyModel {
    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.setModelType(InspectorModelType.TYPE_NOTE)
        this.setTitle(tr('Note'))
        this.setIcon('MUSIC_NOTES')
        this.setModels([
            new NoteheadSettingsModel(repository), new ChordSettingsModel(repository), new StemSettingsModel(repository),
            new BeamSettingsModel(repository), new HookSettingsModel(repository),
        ])
    }

    /** NoteSettingsProxyModel's elementsUpdated callback: updateProperties and onElementsUpdated */
    override updateProperties(): void {
        super.updateProperties()
        // don't update the default sub model if the selection is a range (see issue #30581)
        if (this.m_repository.isRangeSelection()) {
            return
        }
        let defaultModelType = InspectorModelType.TYPE_NOTEHEAD
        for (const element of this.m_repository.score()?.selection().elements() ?? []) {
            defaultModelType = NOTE_PART_TYPES.get(element.type()) ?? defaultModelType
        }
        this.setDefaultSubModelType(defaultModelType)
    }
}
