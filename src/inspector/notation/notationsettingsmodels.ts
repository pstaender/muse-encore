/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * The notation models with a few plain properties, from src/inspector/qml/MuseScore/Inspector/notation:
 * clefs/clefsettingsmodel, keysignatures/keysignaturesettingsmodel, timesignatures/timesignaturesettingsmodel,
 * barlines/barlinesettingsmodel, dynamics/dynamicsettingsmodel, articulations/articulationsettingsmodel,
 * fermatas/fermatasettingsmodel, tempos/temposettingsmodel, tuplets/tupletsettingsmodel,
 * accidentals/accidentalsettingsmodel, spacers/spacersettingsmodel, sectionbreaks/sectionbreaksettingsmodel,
 * rests/restsettingsproxymodel (+ rests/restsettingsmodel, rests/beams/restbeamsettingsmodel),
 * lines/hairpinsettingsmodel (the hairpin's own and the line style properties of textlinesettingsmodel),
 * lines/slurandtiesettingsmodel.
 * TODO(port): the other notation models (ornaments, lines other than hairpins, frames, fret diagrams, bends, lyrics,
 * chord symbols, ...): their sections show the type's title only. Voices and position section (voice assignment).
 */

import type { EngravingItem } from '../../engraving/dom/engravingitem'
import type { Hairpin } from '../../engraving/dom/hairpin'
import { Pid } from '../../engraving/dom/property'
import { Sid } from '../../engraving/style/styledef'
import { ElementType, SlurStyleType } from '../../engraving/types/types'
import { qtrc } from '../../framework/global/translation'
import {
    AbstractInspectorModel, formatDoubleFunc, InspectorModelType, roundDouble, type ConvertPropertyValueFunc,
    type IElementRepositoryService,
} from '../abstractinspectormodel'
import { AbstractInspectorProxyModel } from '../abstractinspectorproxymodel'
import type { PropertyItem } from '../propertyitem'
import { BeamModesModel } from './notes/notesettingsproxymodel'

const tr = (key: string, disambiguation = ''): string => AbstractInspectorModel['tr'](key, disambiguation)

/** the property items of a simple model: name -> pid, with an optional conversion of the loaded values */
type ItemSpec = Record<string, [Pid, ConvertPropertyValueFunc?]>

/** a model of plain property items (the common shape of the simple C++ models) */
abstract class SimpleSettingsModel extends AbstractInspectorModel {
    protected readonly m_items: Record<string, PropertyItem> = {}
    private readonly m_converters: Record<string, ConvertPropertyValueFunc | undefined> = {}

    constructor(repository: IElementRepositoryService, modelType: InspectorModelType, title: string, icon: string,
        private readonly m_type: ElementType, items: ItemSpec, private readonly m_filter?: (e: EngravingItem) => boolean) {
        super(repository)
        this.setModelType(modelType)
        this.setTitle(title)
        this.setIcon(icon)
        for (const [name, [pid, convert]] of Object.entries(items)) {
            this.m_items[name] = this.buildPropertyItem(pid)
            this.m_converters[name] = convert
        }
    }

    override properties(): Record<string, PropertyItem> {
        return this.m_items
    }

    override requestElements(): void {
        this.m_elementList = this.m_repository.findElementsByType(this.m_type, this.m_filter)
    }

    override loadProperties(): void {
        for (const [name, item] of Object.entries(this.m_items)) {
            this.loadPropertyItem(item, this.m_converters[name])
        }
        this.updatemeasurementUnits()
        this.updateIsSystemObjectBelowBottomStaff()
    }

    override flags(): Record<string, unknown> {
        return { measurementUnits: this.m_measurementUnits, isSystemObjectBelowBottomStaff: this.m_isSystemObjectBelowBottomStaff }
    }
}

export class ClefSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_CLEF, tr('Clef'), 'CLEF_BASS', ElementType.CLEF, {
            shouldShowCourtesy: [Pid.SHOW_COURTESY], clefToBarlinePosition: [Pid.CLEF_TO_BARLINE_POS],
        })
    }
}

export class KeySignatureSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_KEYSIGNATURE, tr('Key signature'), 'KEY_SIGNATURE', ElementType.KEYSIG, {
            hasToShowCourtesy: [Pid.SHOW_COURTESY], mode: [Pid.KEYSIG_MODE],
        })
    }
}

export class TimeSignatureSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_TIME_SIGNATURE, tr('Time signature'), 'TIME_SIGNATURE', ElementType.TIMESIG, {
            horizontalScale: [Pid.SCALE, (v) => Array.isArray(v) ? roundDouble(v[0]) : undefined],
            verticalScale: [Pid.SCALE, (v) => Array.isArray(v) ? roundDouble(v[1]) : undefined],
            shouldShowCourtesy: [Pid.SHOW_COURTESY],
        })
        // the scale is one property (a size) shown as two items
        this.m_items.horizontalScale.onModified = (v) =>
            this.onPropertyValueChanged(Pid.SCALE, [Number(v), Number(this.m_items.verticalScale.value() ?? 1)])
        this.m_items.verticalScale.onModified = (v) =>
            this.onPropertyValueChanged(Pid.SCALE, [Number(this.m_items.horizontalScale.value() ?? 1), Number(v)])
    }
}

export class BarlineSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_BARLINE, tr('Barline'), 'SECTION_BREAK', ElementType.BAR_LINE, {
            type: [Pid.BARLINE_TYPE, (v) => Number(v)],
            playCount: [Pid.REPEAT_COUNT, (v) => Number(v)],
            isSpanToNextStaff: [Pid.BARLINE_SPAN, (v) => !!v],
            spanFrom: [Pid.BARLINE_SPAN_FROM, (v) => Number(v)],
            spanTo: [Pid.BARLINE_SPAN_TO, (v) => Number(v)],
            hasToShowTips: [Pid.BARLINE_SHOW_TIPS],
        })
        // TODO(port): play count text settings (PlayCountText), span presets, "Set as staff default"
    }
}

export class DynamicsSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_DYNAMIC, tr('Dynamics'), 'DYNAMIC_FORTE', ElementType.DYNAMIC, {
            avoidBarLines: [Pid.AVOID_BARLINES],
            dynamicScale: [Pid.MUSICAL_SYMBOLS_SCALE, (v) => roundDouble(Number(v)) * 100],
            centerOnNotehead: [Pid.CENTER_ON_NOTEHEAD],
            frameType: [Pid.FRAME_TYPE],
            frameBorderColor: [Pid.FRAME_FG_COLOR],
            frameFillColor: [Pid.FRAME_BG_COLOR],
            frameThickness: [Pid.FRAME_WIDTH, formatDoubleFunc],
            frameMargin: [Pid.FRAME_PADDING, formatDoubleFunc],
            frameCornerRadius: [Pid.FRAME_ROUND, formatDoubleFunc],
        })
        // like C++: qtrc("inspector ", "Dynamics") (sic, the context has a trailing space)
        this.setTitle(qtrc('inspector ', 'Dynamics'))
        this.m_items.dynamicScale.onModified = (v) => this.onPropertyValueChanged(Pid.MUSICAL_SYMBOLS_SCALE, Number(v) / 100)
    }
}

export class ArticulationSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_ARTICULATION, tr('Articulation'), 'ARTICULATION', ElementType.ARTICULATION, {
            placement: [Pid.ARTICULATION_ANCHOR],
        })
    }
}

export class FermataSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_FERMATA, tr('Fermata'), 'FERMATA', ElementType.FERMATA, {
            placementType: [Pid.PLACEMENT],
        })
    }
}

export class TempoSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService, modelType: InspectorModelType) {
        const title = modelType === InspectorModelType.TYPE_A_TEMPO ? tr('A tempo')
            : modelType === InspectorModelType.TYPE_TEMPO_PRIMO ? tr('Tempo primo') : tr('Tempo')
        super(repository, modelType, title, 'METRONOME', ElementType.TEMPO_TEXT, {
            followText: [Pid.TEMPO_FOLLOW_TEXT], tempo: [Pid.TEMPO, formatDoubleFunc],
        })
    }
}

export class TupletSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_TUPLET, tr('Tuplet'), 'TUPLET_NUMBER_WITH_BRACKETS', ElementType.TUPLET, {
            directionType: [Pid.DIRECTION], numberType: [Pid.NUMBER_TYPE], bracketType: [Pid.BRACKET_TYPE],
            lineThickness: [Pid.LINE_WIDTH, formatDoubleFunc],
        })
    }

    override flags(): Record<string, unknown> {
        return {
            ...super.flags(),
            // TupletSettingsModel::possibleNumberTypes / possibleBracketTypes (TupletNumberType, TupletBracketType)
            possibleNumberTypes: [
                { value: 0, text: tr('Number', 'tuplet number type') },
                { value: 1, text: tr('Ratio', 'tuplet number type') },
                { value: 2, text: tr('None', 'tuplet number type') },
            ],
            possibleBracketTypes: [
                { value: 0, text: tr('Auto', 'tuplet bracket type') },
                { value: 1, text: tr('Bracket', 'tuplet bracket type'), icon: 'TUPLET_NUMBER_WITH_BRACKETS' },
                { value: 2, text: tr('None', 'tuplet bracket type'), icon: 'TUPLET_NUMBER_ONLY' },
            ],
        }
    }
}

export class AccidentalSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_ACCIDENTAL, tr('Accidental'), 'ACCIDENTAL_SHARP', ElementType.ACCIDENTAL, {
            bracketType: [Pid.ACCIDENTAL_BRACKET], isSmall: [Pid.SMALL], stackingOrderOffset: [Pid.ACCIDENTAL_STACKING_ORDER_OFFSET],
        })
    }
}

export class SpacerSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_SPACER, tr('Spacer'), 'SPACER', ElementType.SPACER, {
            spacerHeight: [Pid.SPACE, formatDoubleFunc],
        })
    }
}

export class SectionBreakSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_SECTIONBREAK, tr('Section break'), 'SECTION_BREAK', ElementType.LAYOUT_BREAK, {
            shouldStartWithLongInstrNames: [Pid.START_WITH_LONG_NAMES], shouldResetBarNums: [Pid.START_WITH_MEASURE_ONE],
            pauseDuration: [Pid.PAUSE, formatDoubleFunc], firstSystemIndent: [Pid.FIRST_SYSTEM_INDENTATION],
            showCourtesySignatures: [Pid.SHOW_COURTESY],
        })
    }
}

export class RestSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_REST_REST, tr('Rest'), 'REST_8TH', ElementType.REST, {
            alignWithOtherRests: [Pid.ALIGN_WITH_OTHER_RESTS],
        })
    }
}

export class RestBeamSettingsModel extends AbstractInspectorModel {
    private readonly m_beamModesModel: BeamModesModel

    constructor(repository: IElementRepositoryService) {
        super(repository, ElementType.REST)
        this.setModelType(InspectorModelType.TYPE_REST_BEAM)
        this.setTitle(tr('Beam'))
        this.m_beamModesModel = new BeamModesModel(repository)
    }

    override properties(): Record<string, PropertyItem> {
        return { mode: this.m_beamModesModel.properties().mode }
    }

    override updateProperties(): void {
        super.updateProperties()
        this.m_beamModesModel.updateProperties()
    }

    override loadProperties(): void {}
}

export class RestSettingsProxyModel extends AbstractInspectorProxyModel {
    constructor(repository: IElementRepositoryService) {
        super(repository)
        this.setModelType(InspectorModelType.TYPE_REST)
        this.setTitle(tr('Rest'))
        this.setIcon('REST_8TH')
        this.setModels([new RestBeamSettingsModel(repository), new RestSettingsModel(repository)])
    }
}

export class HairpinSettingsModel extends SimpleSettingsModel {
    constructor(repository: IElementRepositoryService) {
        super(repository, InspectorModelType.TYPE_HAIRPIN, tr('Hairpin'), 'HAIRPIN', ElementType.HAIRPIN, {
            isNienteCircleVisible: [Pid.HAIRPIN_CIRCLEDTIP], height: [Pid.HAIRPIN_HEIGHT, formatDoubleFunc],
            continuousHeight: [Pid.HAIRPIN_CONT_HEIGHT, formatDoubleFunc],
            // TextLineSettingsModel's
            allowDiagonal: [Pid.DIAGONAL], lineStyle: [Pid.LINE_STYLE], thickness: [Pid.LINE_WIDTH, formatDoubleFunc],
            dashLineLength: [Pid.DASH_LINE_LEN, formatDoubleFunc], dashGapLength: [Pid.DASH_GAP_LEN, formatDoubleFunc],
            placement: [Pid.PLACEMENT],
        }, (e) => {
            const t = (e as unknown as Hairpin).hairpinType()
            return t === 0 /* CRESC_HAIRPIN */ || t === 1 /* DIM_HAIRPIN */
        })
    }
}

export class SlurAndTieSettingsModel extends SimpleSettingsModel {
    private readonly m_isLaissezVib: boolean

    constructor(repository: IElementRepositoryService, modelType: InspectorModelType) {
        const [type, title] = modelType === InspectorModelType.TYPE_TIE ? [ElementType.TIE, tr('Tie')]
            : modelType === InspectorModelType.TYPE_LAISSEZ_VIB ? [ElementType.LAISSEZ_VIB, tr('Laissez vibrer')]
                : modelType === InspectorModelType.TYPE_PARTIAL_TIE ? [ElementType.PARTIAL_TIE, tr('Tie (partial)')]
                    : modelType === InspectorModelType.TYPE_HAMMER_ON_PULL_OFF ? [ElementType.HAMMER_ON_PULL_OFF, tr('Hammer-on/pull-off')]
                        : [ElementType.SLUR, tr('Slur')]
        super(repository, modelType, title, '', type, {
            lineStyle: [Pid.SLUR_STYLE_TYPE], direction: [Pid.SLUR_DIRECTION], tiePlacement: [Pid.TIE_PLACEMENT],
            minLength: [Pid.MIN_LENGTH],
        })
        this.m_isLaissezVib = modelType === InspectorModelType.TYPE_LAISSEZ_VIB
    }

    override flags(): Record<string, unknown> {
        const smuflLv = (e: EngravingItem): boolean => e.isLaissezVib() && e.style().styleB(Sid.laissezVibUseSmuflSym)
        return {
            ...super.flags(),
            isLaissezVib: this.m_isLaissezVib,
            isTiePlacementAvailable: this.m_elementList.some(e => e.isTie()),
            isMinLengthAvailable: this.m_elementList.some(e => e.isLaissezVib() && !smuflLv(e)),
            isLineStyleAvailable: !this.m_elementList.some(smuflLv),
            possibleLineStyles: [
                { value: SlurStyleType.Solid, text: tr('Normal', 'slur style'), icon: 'LINE_NORMAL' },
                { value: SlurStyleType.WideDashed, text: tr('Wide dashed', 'slur style'), icon: 'LINE_WIDE_DASHED' },
                { value: SlurStyleType.Dashed, text: tr('Dashed', 'slur style'), icon: 'LINE_DASHED' },
                { value: SlurStyleType.Dotted, text: tr('Dotted', 'slur style'), icon: 'LINE_DOTTED' },
            ],
        }
    }
}
