/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/qml/MuseScore/Inspector/inspectormodelcreator.h/.cpp
 * The models not ported yet are UnportedSettingsModels: the section shows their (C++) title and the elements,
 * but no properties. TODO(port): those models.
 */

import { qtrc } from '../framework/global/translation'
import {
    AbstractInspectorModel, InspectorModelType, type IElementRepositoryService,
} from './abstractinspectormodel'
import { inspectorModelFactory } from './abstractinspectorproxymodel'
import {
    AccidentalSettingsModel, ArticulationSettingsModel, BarlineSettingsModel, ChordBracketSettingsModel, ClefSettingsModel,
    DynamicsSettingsModel, ImageSettingsModel,
    FermataSettingsModel, HairpinSettingsModel, KeySignatureSettingsModel, RestSettingsProxyModel, SectionBreakSettingsModel,
    SlurAndTieSettingsModel, SpacerSettingsModel, TempoSettingsModel, TimeSignatureSettingsModel, TupletSettingsModel,
} from './notation/notationsettingsmodels'
import {
    BeamSettingsModel, ChordSettingsModel, HookSettingsModel, NoteheadSettingsModel, NoteSettingsProxyModel, StemSettingsModel,
} from './notation/notes/notesettingsproxymodel'
import type { PropertyItem } from './propertyitem'

/** the titles of the C++ models not ported yet */
const UNPORTED_TITLES: Partial<Record<InspectorModelType, [string, string]>> = {
    [InspectorModelType.TYPE_GLISSANDO]: ['inspector', 'Glissando'],
    [InspectorModelType.TYPE_PLAY_COUNT_TEXT]: ['inspector', 'Play count text'],
    [InspectorModelType.TYPE_MARKER]: ['inspector', 'Marker'],
    [InspectorModelType.TYPE_JUMP]: ['inspector', 'Jump'],
    [InspectorModelType.TYPE_FRET_DIAGRAM]: ['inspector', 'Fretboard diagram'],
    [InspectorModelType.TYPE_PEDAL]: ['inspector', 'Pedal'],
    [InspectorModelType.TYPE_CRESCENDO]: ['inspector', 'Crescendo'],
    [InspectorModelType.TYPE_DIMINUENDO]: ['inspector', 'Diminuendo'],
    [InspectorModelType.TYPE_OTTAVA]: ['inspector', 'Ottava'],
    [InspectorModelType.TYPE_VOLTA]: ['inspector', 'Volta'],
    [InspectorModelType.TYPE_TEXT_LINE]: ['inspector', 'Text line'],
    [InspectorModelType.TYPE_NOTELINE]: ['inspector', 'Note-anchored line'],
    [InspectorModelType.TYPE_GRADUAL_TEMPO_CHANGE]: ['inspector', 'Tempo change'],
    [InspectorModelType.TYPE_VIBRATO]: ['inspector', 'Vibrato'],
    [InspectorModelType.TYPE_STAFF_TYPE_CHANGES]: ['inspector', 'Staff type changes'],
    [InspectorModelType.TYPE_TEXT_FRAME]: ['inspector', 'Text frame'],
    [InspectorModelType.TYPE_VERTICAL_FRAME]: ['inspector', 'Vertical frame'],
    [InspectorModelType.TYPE_HORIZONTAL_FRAME]: ['inspector', 'Horizontal frame'],
    [InspectorModelType.TYPE_FRET_FRAME]: ['inspector', 'Fretboard diagram legend'],
    [InspectorModelType.TYPE_ORNAMENT]: ['inspector', 'Ornament'],
    [InspectorModelType.TYPE_AMBITUS]: ['inspector', 'Ambitus'],
    [InspectorModelType.TYPE_CHORD_SYMBOL]: ['inspector', 'Chord symbol'],
    [InspectorModelType.TYPE_BRACKET]: ['inspector', 'Bracket'],
    [InspectorModelType.TYPE_MMREST]: ['inspector', 'Multimeasure rest'],
    [InspectorModelType.TYPE_BEND]: ['inspector', 'Bend/dive'],
    [InspectorModelType.TYPE_TREMOLOBAR]: ['inspector', 'Tremolo bar'],
    [InspectorModelType.TYPE_TREMOLO]: ['inspector', 'Tremolos'],
    [InspectorModelType.TYPE_MEASURE_REPEAT]: ['inspector', 'Measure repeat'],
    [InspectorModelType.TYPE_INSTRUMENT_NAME]: ['inspector', 'Instrument names'],
    [InspectorModelType.TYPE_LYRICS]: ['inspector', 'Lyrics'],
    [InspectorModelType.TYPE_LYRICS_LINE]: ['inspector', 'Lyrics line'],
    [InspectorModelType.TYPE_PARTIAL_LYRICS_LINE]: ['inspector', 'Partial lyrics line'],
    [InspectorModelType.TYPE_EXPRESSION]: ['inspector ', 'Expression'],
    [InspectorModelType.TYPE_STRING_TUNINGS]: ['inspector', 'Fretted instruments'],
    [InspectorModelType.TYPE_SYMBOL]: ['inspector', 'Symbol'],
}

/** a model whose C++ counterpart is not ported yet: title only */
export class UnportedSettingsModel extends AbstractInspectorModel {
    constructor(repository: IElementRepositoryService, modelType: InspectorModelType) {
        super(repository)
        this.setModelType(modelType)
        const title = UNPORTED_TITLES[modelType]
        this.setTitle(title ? qtrc(title[0], title[1]) : '')
    }

    override properties(): Record<string, PropertyItem> { return {} }
    override isEmpty(): boolean { return false }
    override loadProperties(): void {}
}

export class InspectorModelCreator {
    static newInspectorModel(modelType: InspectorModelType, repository: IElementRepositoryService): AbstractInspectorModel | null {
        switch (modelType) {
        case InspectorModelType.TYPE_NOTE: return new NoteSettingsProxyModel(repository)
        case InspectorModelType.TYPE_NOTEHEAD: return new NoteheadSettingsModel(repository)
        case InspectorModelType.TYPE_CHORD: return new ChordSettingsModel(repository)
        case InspectorModelType.TYPE_STEM: return new StemSettingsModel(repository)
        case InspectorModelType.TYPE_HOOK: return new HookSettingsModel(repository)
        case InspectorModelType.TYPE_BEAM: return new BeamSettingsModel(repository)
        case InspectorModelType.TYPE_FERMATA: return new FermataSettingsModel(repository)
        case InspectorModelType.TYPE_TEMPO:
        case InspectorModelType.TYPE_A_TEMPO:
        case InspectorModelType.TYPE_TEMPO_PRIMO:
            return new TempoSettingsModel(repository, modelType)
        case InspectorModelType.TYPE_BARLINE: return new BarlineSettingsModel(repository)
        case InspectorModelType.TYPE_SECTIONBREAK: return new SectionBreakSettingsModel(repository)
        case InspectorModelType.TYPE_KEYSIGNATURE: return new KeySignatureSettingsModel(repository)
        case InspectorModelType.TYPE_ACCIDENTAL: return new AccidentalSettingsModel(repository)
        case InspectorModelType.TYPE_SPACER: return new SpacerSettingsModel(repository)
        case InspectorModelType.TYPE_CLEF: return new ClefSettingsModel(repository)
        case InspectorModelType.TYPE_HAIRPIN: return new HairpinSettingsModel(repository)
        case InspectorModelType.TYPE_SLUR:
        case InspectorModelType.TYPE_TIE:
        case InspectorModelType.TYPE_LAISSEZ_VIB:
        case InspectorModelType.TYPE_PARTIAL_TIE:
        case InspectorModelType.TYPE_HAMMER_ON_PULL_OFF:
            return new SlurAndTieSettingsModel(repository, modelType)
        case InspectorModelType.TYPE_ARTICULATION: return new ArticulationSettingsModel(repository)
        case InspectorModelType.TYPE_TAPPING: return new ArticulationSettingsModel(repository, InspectorModelType.TYPE_TAPPING)
        case InspectorModelType.TYPE_IMAGE: return new ImageSettingsModel(repository)
        case InspectorModelType.TYPE_CHORD_BRACKET: return new ChordBracketSettingsModel(repository)
        case InspectorModelType.TYPE_TIME_SIGNATURE: return new TimeSignatureSettingsModel(repository)
        case InspectorModelType.TYPE_TUPLET: return new TupletSettingsModel(repository)
        case InspectorModelType.TYPE_REST: return new RestSettingsProxyModel(repository)
        case InspectorModelType.TYPE_DYNAMIC: return new DynamicsSettingsModel(repository)
        case InspectorModelType.TYPE_UNDEFINED:
            return null
        default:
            return UNPORTED_TITLES[modelType] ? new UnportedSettingsModel(repository, modelType) : null
        }
    }
}

inspectorModelFactory.create = (modelType, repository) => InspectorModelCreator.newInspectorModel(modelType, repository)
