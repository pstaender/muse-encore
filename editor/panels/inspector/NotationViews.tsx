/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The notation section (src/inspector/qml/MuseScore/Inspector/notation): NotationSingleElementView (the settings of
 * one element type), NotationMultiElementView (a popup button per type) and NotationInspectorSectionLoader with the
 * settings views of the ported models: NoteSettings (HeadSettings, StemSettings, BeamSettings), RestSettings,
 * ClefSettings, KeySignatureSettings, TimeSignatureSettings, BarlineSettings, DynamicsSettings, ArticulationSettings,
 * FermataSettings, TempoSettings, TupletSettings, AccidentalSettings, SpacerSettings, SectionBreakSettings,
 * HairpinSettings (style), SlurAndTieSettings, ChordBracketSettings, ImageSettings (tapping: ArticulationSettings).
 * TODO(port): the views of the other models (their sections are shown with the title only).
 */
import { useState } from 'react'
import { qtrc } from '../../i18n'
import {
    DirectionSection, DropdownPropertyView, flag, FlatRadioButtonGroupPropertyView, icon, OffsetSection, PlacementSection,
    PopupViewButton, prop, PropertyCheckBox, ShowMore, SpinBoxPropertyView, subModel, TabBar, type ModelRef, type Option,
} from './common'

const tr = (key: string, disambiguation = ''): string => qtrc('inspector', key, disambiguation)
const sp = (): string => qtrc('global', 'sp')

// ---------------------------------------------------------------------------------
//   notes
// ---------------------------------------------------------------------------------

function HeadSettings({ head, chord }: { head: ModelRef | null; chord: ModelRef | null }): React.JSX.Element {
    const isTrillCueNote = flag(head, 'isTrillCueNote', false)
    const groups = flag<Option[]>(head, 'noteheadGroups', []).map(g => ({ value: g.value, text: g.text }))
    const schemes = flag<Option[]>(head, 'possibleHeadSystemTypes', [])
    return (
        <div className="insp-column">
            <FlatRadioButtonGroupPropertyView p={prop(head, 'hasHeadParentheses')} title={tr('Notehead parentheses')} options={[
                { icon: 'NOTE_HEAD', value: 0 /* PAREN_NONE */, title: tr('Normal notehead') },
                { icon: 'NOTE_HEAD_PARENTHESES', value: 3 /* PAREN_BOTH */, title: tr('Notehead with parentheses') },
            ]} />
            {/* NoteheadGroupSelector: a grid of noteheads in MuseScore */}
            <DropdownPropertyView p={prop(head, 'headGroup')} title={tr('Notehead')} options={groups} />
            {!isTrillCueNote && <PropertyCheckBox p={prop(head, 'isHeadHidden')} text={tr('Hide notehead')} />}
            <PropertyCheckBox p={prop(head, 'isHeadSmall')} text={tr('Small notehead')} />
            {!isTrillCueNote && (
                <FlatRadioButtonGroupPropertyView p={prop(head, 'dotPosition')} title={tr('Duration dot position')} options={[
                    { text: tr('Auto'), value: 0, title: tr('Auto', 'augmentation dot position') },
                    { icon: 'DOT_BELOW_LINE', value: 2 /* DOWN */, title: tr('Down', 'augmentation dot position') },
                    { icon: 'DOT_ABOVE_LINE', value: 1 /* UP */, title: tr('Up', 'augmentation dot position') },
                ]} />
            )}
            {!isTrillCueNote && (
                <ShowMore>
                    <DropdownPropertyView p={prop(head, 'headSystem')} title={tr('Notehead scheme')} options={schemes} />
                    <FlatRadioButtonGroupPropertyView p={prop(head, 'headType')} title={tr('Override visual duration')} options={[
                        { text: tr('Auto'), value: -1, title: tr('Auto') },
                        { icon: 'NOTE_HEAD_QUARTER', value: 2, title: tr('Quarter') },
                        { icon: 'NOTE_HEAD_HALF', value: 1, title: tr('Half') },
                        { icon: 'NOTE_HEAD_WHOLE', value: 0, title: tr('Whole') },
                        { icon: 'NOTE_HEAD_BREVIS', value: 3, title: tr('Brevis') },
                    ]} />
                    <DirectionSection p={prop(head, 'headDirection')} title={tr('Note direction')} horizontal />
                    <OffsetSection p={prop(head, 'offset')} title={tr('Notehead offset')} units={flag(head, 'measurementUnits', 'sp')} />
                    <FlatRadioButtonGroupPropertyView p={prop(chord, 'combineVoice')}
                        title={tr('Combine with voices that share the same stem direction')} options={[
                            { text: tr('Auto'), value: 0 }, { text: tr('On'), value: 1 }, { text: tr('Off'), value: 2 },
                        ]} />
                </ShowMore>
            )}
        </div>
    )
}

function StemSettings({ chord, stem, hook }: { chord: ModelRef | null; stem: ModelRef | null; hook: ModelRef | null }): React.JSX.Element {
    const stemEmpty = !stem || stem.model.isEmpty
    return (
        <div className="insp-column">
            <PropertyCheckBox p={prop(chord, 'isStemless')} text={tr('Stemless')} />
            {flag(chord, 'showStemSlashVisible', false) && (
                <PropertyCheckBox p={prop(chord, 'showStemSlash')} text={tr('Show stem slash')} />
            )}
            {!stemEmpty && <DirectionSection p={prop(stem, 'stemDirection')} title={tr('Stem direction')} />}
            {/* "Flag style" is a style setting (Sid::useStraightNoteFlags): TODO(port) changing styles */}
            <div className="insp-property disabled">
                <div className="insp-property-title"><span>{tr('Flag style')}</span></div>
                <div className="insp-radio-group" role="radiogroup" aria-label={tr('Flag style')}>
                    {[{ icon: 'NOTEFLAGS_TRADITIONAL', v: false, t: tr('Traditional', 'Note flags') },
                        { icon: 'NOTEFLAGS_STRAIGHT', v: true, t: tr('Straight', 'Note flags') }].map(o => (
                        <button key={o.t} type="button" role="radio" className="insp-radio insp-icon" title={o.t} aria-label={o.t} disabled
                            aria-checked={flag(stem, 'useStraightNoteFlags', false) === o.v}>
                            {icon(o.icon)}
                        </button>
                    ))}
                </div>
            </div>
            {!stemEmpty && (
                <ShowMore>
                    <div className="insp-row">
                        <SpinBoxPropertyView p={prop(stem, 'thickness')} title={tr('Thickness')} unit={sp()} step={0.01} min={0.01} max={4} half />
                        <SpinBoxPropertyView p={prop(stem, 'length')} title={tr('Length')} unit={sp()} step={0.5} min={-20} max={20} half />
                    </div>
                    <OffsetSection p={prop(stem, 'offset')} title={tr('Stem offset')} units={flag(stem, 'measurementUnits', 'sp')} />
                    {hook && !hook.model.isEmpty && (
                        <OffsetSection p={prop(hook, 'offset')} title={tr('Flag offset')} units={flag(hook, 'measurementUnits', 'sp')} />
                    )}
                </ShowMore>
            )}
        </div>
    )
}

/** BeamTypesGrid of BeamSettings / RestBeamSettings (BeamModesModel's mode) */
function BeamModes({ m }: { m: ModelRef | null }): React.JSX.Element {
    return <FlatRadioButtonGroupPropertyView p={prop(m, 'mode')} title={tr('Beam type')} options={[
        { value: 0 /* AUTO */, icon: 'AUTO_TEXT', title: tr('Auto') },
        { value: 1 /* NONE */, icon: 'BEAM_NONE', title: tr('No beam') },
        { value: 2 /* BEGIN */, icon: 'BEAM_BREAK_LEFT', title: tr('Break beam left') },
        { value: 3 /* BEGIN16 (MODE_BEGIN32) */, icon: 'BEAM_BREAK_INNER_8TH', title: tr('Break inner beams (8th)') },
        { value: 4 /* BEGIN32 (MODE_BEGIN64) */, icon: 'BEAM_BREAK_INNER_16TH', title: tr('Break inner beams (16th)') },
        { value: 5 /* MID */, icon: 'BEAM_JOIN', title: tr('Join beams') },
    ]} />
}

function BeamSettings({ m }: { m: ModelRef | null }): React.JSX.Element {
    const empty = !m || m.model.isEmpty
    return (
        <div className="insp-column">
            <BeamModes m={m} />
            {!empty && (
                <>
                    {flag(m, 'isCrossStaffMoveAvailable', false)
                        ? null
                        : <DirectionSection p={prop(m, 'stemDirection')} title={tr('Beam direction')} />}
                    {flag(m, 'isFeatheringHeightChangingAllowed', false) && (
                        <div className="insp-row">
                            <SpinBoxPropertyView p={prop(m, 'featheringHeightLeft')} title={tr('Feathering left')} step={0.1} min={0} max={4} half />
                            <SpinBoxPropertyView p={prop(m, 'featheringHeightRight')} title={tr('Feathering right')} step={0.1} min={0} max={4} half />
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

function NoteSettings({ m }: { m: ModelRef }): React.JSX.Element {
    const head = subModel(m, 'TYPE_NOTEHEAD')
    const chord = subModel(m, 'TYPE_CHORD')
    const stem = subModel(m, 'TYPE_STEM')
    const hook = subModel(m, 'TYPE_HOOK')
    const beam = subModel(m, 'TYPE_BEAM')
    const def = m.model.defaultSubModelType
    const defaultTab = def === 'TYPE_STEM' || def === 'TYPE_HOOK' ? 'stem' : def === 'TYPE_BEAM' ? 'beam' : 'head'
    const [tab, setTab] = useState<string | null>(null)
    const current = tab ?? defaultTab
    const trill = flag(head, 'isTrillCueNote', false)
    return (
        <div className="insp-column" data-view="NoteSettings">
            <TabBar label={m.model.title} current={current} onChange={setTab} tabs={[
                { key: 'head', title: head?.model.title ?? '' },
                { key: 'stem', title: stem?.model.title ?? '', hidden: trill },
                { key: 'beam', title: beam?.model.title ?? '', hidden: trill },
            ]} />
            {current === 'head' && <HeadSettings head={head} chord={chord} />}
            {current === 'stem' && <StemSettings chord={chord} stem={stem} hook={hook} />}
            {current === 'beam' && <BeamSettings m={beam} />}
        </div>
    )
}

function RestSettings({ m }: { m: ModelRef }): React.JSX.Element {
    const [tab, setTab] = useState('beam')
    const beam = subModel(m, 'TYPE_REST_BEAM')
    const rest = subModel(m, 'TYPE_REST_REST')
    return (
        <div className="insp-column">
            <TabBar label={m.model.title} current={tab} onChange={setTab} tabs={[
                { key: 'beam', title: beam?.model.title ?? '' },
                { key: 'rest', title: rest?.model.title ?? '' },
            ]} />
            {tab === 'beam' && <BeamModes m={beam} />}
            {tab === 'rest' && <PropertyCheckBox p={prop(rest, 'alignWithOtherRests')} text={tr('Align with other rests in the same voice')} />}
        </div>
    )
}

// ---------------------------------------------------------------------------------
//   other element types
// ---------------------------------------------------------------------------------

const FRAME_OPTIONS = (): Option[] => [
    { text: tr('None', 'text frame type'), value: 0, title: tr('None', 'text frame type') },
    { icon: 'FRAME_SQUARE', value: 1, title: tr('Rectangle', 'text frame type') },
    { icon: 'FRAME_CIRCLE', value: 2, title: tr('Circle', 'text frame type') },
]

function LineStyleSection({ m, styleProp, title = tr('Line style'), options }: {
    m: ModelRef; styleProp: string; title?: string; options?: Option[]
}): React.JSX.Element {
    const style = prop(m, styleProp)
    return (
        <>
            <FlatRadioButtonGroupPropertyView p={style} title={title} options={options ?? [
                { icon: 'LINE_NORMAL', value: 0, title: tr('Normal', 'line type') },
                { icon: 'LINE_DASHED', value: 1, title: tr('Dashed', 'line type') },
                { icon: 'LINE_DOTTED', value: 2, title: tr('Dotted', 'line type') },
            ]} />
            {style?.info.value === 1 && (
                <div className="insp-row">
                    <SpinBoxPropertyView p={prop(m, 'dashLineLength')} title={tr('Dash')} step={0.1} min={0.1} max={100} half />
                    <SpinBoxPropertyView p={prop(m, 'dashGapLength')} title={tr('Gap')} step={0.1} min={0.1} max={100} half />
                </div>
            )}
        </>
    )
}

const VIEWS: Record<string, (props: { m: ModelRef }) => React.JSX.Element | null> = {
    TYPE_NOTE: NoteSettings,
    TYPE_REST: RestSettings,
    TYPE_CLEF: ({ m }) => (
        <div className="insp-column">
            <PropertyCheckBox p={prop(m, 'shouldShowCourtesy')} text={tr('Show courtesy clef')} />
            <FlatRadioButtonGroupPropertyView p={prop(m, 'clefToBarlinePosition')} title={tr('Position relative to barline')} options={[
                { text: tr('Auto'), value: 0, title: tr('Auto') },
                { text: tr('Before'), value: 1, title: tr('Before') },
                { text: tr('After'), value: 2, title: tr('After') },
            ]} />
        </div>
    ),
    TYPE_KEYSIGNATURE: ({ m }) => (
        <div className="insp-column">
            <PropertyCheckBox p={prop(m, 'hasToShowCourtesy')} text={tr('Show courtesy key signature')} />
            <DropdownPropertyView p={prop(m, 'mode')} title={tr('Mode')} options={[
                { text: tr('Unknown', 'key signature mode'), value: -1 },
                { text: tr('None', 'key signature mode'), value: 0 },
                { text: tr('Major', 'key signature mode'), value: 1 },
                { text: tr('Minor', 'key signature mode'), value: 2 },
                { text: tr('Dorian', 'key signature mode'), value: 3 },
                { text: tr('Phrygian', 'key signature mode'), value: 4 },
                { text: tr('Lydian', 'key signature mode'), value: 5 },
                { text: tr('Mixolydian', 'key signature mode'), value: 6 },
                { text: tr('Aeolian', 'key signature mode'), value: 7 },
                { text: tr('Ionian', 'key signature mode'), value: 8 },
                { text: tr('Locrian', 'key signature mode'), value: 9 },
            ]} />
        </div>
    ),
    TYPE_TIME_SIGNATURE: ({ m }) => (
        <div className="insp-column">
            <div className="insp-row">
                <SpinBoxPropertyView p={prop(m, 'horizontalScale')} title={tr('Scale')} unit="x" step={0.25} decimals={2} min={1} max={100} half />
                <SpinBoxPropertyView p={prop(m, 'verticalScale')} title={' '} unit="x" step={0.25} decimals={2} min={1} max={100} half />
            </div>
            <PropertyCheckBox p={prop(m, 'shouldShowCourtesy')} text={tr('Show courtesy time signature')} />
        </div>
    ),
    TYPE_BARLINE: ({ m }) => (
        <div className="insp-column">
            <DropdownPropertyView p={prop(m, 'type')} title={tr('Type')} options={[
                { text: tr('Single barline'), value: 0x1 },
                { text: tr('Double barline'), value: 0x2 },
                { text: tr('Dashed barline'), value: 0x10 },
                { text: tr('Final barline'), value: 0x20 },
                { text: tr('Dotted barline'), value: 0x80 },
                { text: tr('Reverse final barline'), value: 0x100 },
                { text: tr('Heavy barline'), value: 0x200 },
                { text: tr('Heavy double barline'), value: 0x400 },
                { text: tr('Left (start) repeat barline'), value: 0x4 },
                { text: tr('Right (end) repeat barline'), value: 0x8 },
                { text: tr('Right and left (end/start) repeat barline'), value: 0x40 },
            ]} />
            <FlatRadioButtonGroupPropertyView p={prop(m, 'hasToShowTips')} title={tr('Repeat style')} options={[
                { icon: 'BARLINE_UNWINGED', value: false }, { icon: 'BARLINE_WINGED', value: true },
            ]} />
            <ShowMore>
                <PropertyCheckBox p={prop(m, 'isSpanToNextStaff')} text={tr('Span to next staff')} />
                <div className="insp-row">
                    <SpinBoxPropertyView p={prop(m, 'spanFrom')} title={tr('Span from')} decimals={0} step={1} min={-4} max={99} half />
                    <SpinBoxPropertyView p={prop(m, 'spanTo')} title={tr('Span to')} decimals={0} step={1} min={-99} max={99} half />
                </div>
            </ShowMore>
        </div>
    ),
    TYPE_DYNAMIC: ({ m }) => (
        <div className="insp-column">
            <SpinBoxPropertyView p={prop(m, 'dynamicScale')} title={tr('Scale')} unit="%" decimals={0} step={1} min={0} max={1000} />
            <PropertyCheckBox p={prop(m, 'avoidBarLines')} text={tr('Avoid barlines')} />
            <ShowMore>
                <FlatRadioButtonGroupPropertyView p={prop(m, 'centerOnNotehead')} title={tr('Alignment with notehead')} options={[
                    { icon: 'DYNAMIC_CENTER_1', value: true, title: tr('Center on notehead') },
                    { icon: 'DYNAMIC_CENTER_2', value: false, title: tr('Use text centering') },
                ]} />
                <FlatRadioButtonGroupPropertyView p={prop(m, 'frameType')} title={tr('Frame')} options={FRAME_OPTIONS()} />
            </ShowMore>
        </div>
    ),
    TYPE_ARTICULATION: ({ m }) => (
        <PlacementSection p={prop(m, 'placement')} title={tr('Placement')} options={[
            { text: tr('Auto'), value: 2 /* AUTO */ }, { text: tr('Above'), value: 0 /* TOP */ }, { text: tr('Below'), value: 1 /* BOTTOM */ },
        ]} />
    ),
    TYPE_TAPPING: ({ m }) => (
        <PlacementSection p={prop(m, 'placement')} title={tr('Placement')} options={[
            { text: tr('Auto'), value: 2 /* AUTO */ }, { text: tr('Above'), value: 0 /* TOP */ }, { text: tr('Below'), value: 1 /* BOTTOM */ },
        ]} />
    ),
    TYPE_CHORD_BRACKET: ({ m }) => flag(m, 'isBracket', true) ? (
        <div className="insp-column">
            <FlatRadioButtonGroupPropertyView p={prop(m, 'bracketRightSide')} title={tr('Placement')} options={[
                { text: tr('Left'), value: false }, { text: tr('Right'), value: true },
            ]} />
            <FlatRadioButtonGroupPropertyView p={prop(m, 'hookPos')} title={tr('Hooks')} options={[
                { text: tr('Both'), value: 0 }, { text: tr('Above'), value: 1 }, { text: tr('Below'), value: 2 },
            ]} />
            <SpinBoxPropertyView p={prop(m, 'hookLen')} title={tr('Hook length')} unit={sp()} step={0.1} min={0} max={10} />
        </div>
    ) : null,
    TYPE_IMAGE: ({ m }) => {
        const units = prop(m, 'isSizeInSpatiums')?.info.value ? sp() : qtrc('global', 'mm')
        return (
            <div className="insp-column">
                <div className="insp-row">
                    <SpinBoxPropertyView p={prop(m, 'height')} title={tr('Image height')} unit={units} step={0.5} min={0} max={9999} half />
                    <SpinBoxPropertyView p={prop(m, 'width')} title={tr('Image width')} unit={units} step={0.5} min={0} max={9999} half />
                </div>
                <PropertyCheckBox p={prop(m, 'isAspectRatioLocked')} text={tr('Lock')} />
                <PropertyCheckBox p={prop(m, 'shouldScaleToFrameSize')} text={tr('Scale to frame size')} />
                <PropertyCheckBox p={prop(m, 'isSizeInSpatiums')} text={tr('Use staff space units')} />
            </div>
        )
    },
    TYPE_FERMATA: ({ m }) => <PlacementSection p={prop(m, 'placementType')} />,
    TYPE_TEMPO: TempoSettings,
    TYPE_A_TEMPO: TempoSettings,
    TYPE_TEMPO_PRIMO: TempoSettings,
    TYPE_TUPLET: ({ m }) => (
        <div className="insp-column">
            <DirectionSection p={prop(m, 'directionType')} />
            <FlatRadioButtonGroupPropertyView p={prop(m, 'numberType')} title={tr('Number type')} options={flag(m, 'possibleNumberTypes', [])} />
            <FlatRadioButtonGroupPropertyView p={prop(m, 'bracketType')} title={tr('Bracket type')}
                options={flag<Option[]>(m, 'possibleBracketTypes', []).map(o => ({ ...o, title: o.text, text: o.icon ? undefined : o.text }))} />
            <SpinBoxPropertyView p={prop(m, 'lineThickness')} title={tr('Line thickness')} unit={sp()} step={0.1} min={0.1} max={1} />
        </div>
    ),
    TYPE_ACCIDENTAL: ({ m }) => (
        <div className="insp-column">
            <FlatRadioButtonGroupPropertyView p={prop(m, 'bracketType')} title={tr('Bracket type')} options={[
                { text: tr('None', 'bracket type'), value: 0 },
                { icon: 'BRACKET_PARENTHESES', value: 1, title: tr('Parentheses', 'bracket type') },
                { icon: 'BRACKET_PARENTHESES_SQUARE', value: 2, title: tr('Brackets', 'bracket type') },
            ]} />
            <PropertyCheckBox p={prop(m, 'isSmall')} text={tr('Small accidental')} />
        </div>
    ),
    TYPE_SPACER: ({ m }) => (
        <SpinBoxPropertyView p={prop(m, 'spacerHeight')} title={tr('Height')} unit={sp()} step={0.5} min={0} max={999} />
    ),
    TYPE_SECTIONBREAK: ({ m }) => (
        <div className="insp-column">
            <SpinBoxPropertyView p={prop(m, 'pauseDuration')} title={tr('Pause before new section starts')} unit={qtrc('global', 's')}
                step={0.5} min={0} max={999} />
            <PropertyCheckBox p={prop(m, 'shouldStartWithLongInstrNames')} text={tr('Start new section with long instrument names')} />
            <PropertyCheckBox p={prop(m, 'shouldResetBarNums')} text={tr('Reset measure numbers for new section')} />
            <PropertyCheckBox p={prop(m, 'firstSystemIndent')} text={tr('Indent first system of new section')} />
            <PropertyCheckBox p={prop(m, 'showCourtesySignatures')} text={tr('Hide courtesy clefs and signatures')} invert />
        </div>
    ),
    TYPE_HAIRPIN: ({ m }) => (
        <div className="insp-column">
            <div className="insp-grid2">
                <PropertyCheckBox p={prop(m, 'isNienteCircleVisible')} text={tr('Niente circle')} />
                <PropertyCheckBox p={prop(m, 'allowDiagonal')} text={tr('Allow diagonal')} />
            </div>
            <LineStyleSection m={m} styleProp="lineStyle" />
            <div className="insp-row">
                <SpinBoxPropertyView p={prop(m, 'thickness')} title={tr('Thickness')} unit={sp()} step={0.01} min={0.01} max={10} half />
                <SpinBoxPropertyView p={prop(m, 'height')} title={tr('Height')} unit={sp()} step={0.1} min={0.1} max={10} half />
            </div>
            <SpinBoxPropertyView p={prop(m, 'continuousHeight')} title={tr('Height (new system)')} unit={sp()} step={0.1} min={0.1} max={10} />
            <PlacementSection p={prop(m, 'placement')} />
        </div>
    ),
    TYPE_SLUR: SlurAndTieSettings,
    TYPE_TIE: SlurAndTieSettings,
    TYPE_LAISSEZ_VIB: SlurAndTieSettings,
    TYPE_PARTIAL_TIE: SlurAndTieSettings,
    TYPE_HAMMER_ON_PULL_OFF: SlurAndTieSettings,
}

function TempoSettings({ m }: { m: ModelRef }): React.JSX.Element {
    const follow = prop(m, 'followText')
    return (
        <div className="insp-column">
            <PropertyCheckBox p={follow} text={tr('Follow written tempo')} />
            <SpinBoxPropertyView p={follow?.info.value === false ? prop(m, 'tempo') : null} title={tr('Override written tempo')}
                unit={tr('BPM')} decimals={1} step={1} min={1} max={999} />
        </div>
    )
}

function SlurAndTieSettings({ m }: { m: ModelRef }): React.JSX.Element {
    const isLv = flag(m, 'isLaissezVib', false)
    return (
        <div className="insp-column">
            {flag(m, 'isLineStyleAvailable', true) && (
                <LineStyleSection m={m} styleProp="lineStyle" title={tr('Style')} options={flag(m, 'possibleLineStyles', [])
                    .map((o: Option) => ({ ...o, title: o.text, text: undefined }))} />
            )}
            <PlacementSection p={prop(m, 'direction')} options={[
                { text: tr('Auto'), value: 0 }, { text: tr('Above'), value: 1 /* UP */ }, { text: tr('Below'), value: 2 /* DOWN */ },
            ]} />
            {flag(m, 'isTiePlacementAvailable', false) && (
                <FlatRadioButtonGroupPropertyView p={prop(m, 'tiePlacement')}
                    title={isLv ? tr('Laissez vibrer placement') : tr('Tie placement')} options={[
                        { text: tr('Auto'), value: 0, title: tr('Auto') },
                        { icon: isLv ? 'LV_INSIDE' : 'TIE_INSIDE', value: 1, title: tr('Inside') },
                        { icon: isLv ? 'LV_OUTSIDE' : 'TIE_OUTSIDE', value: 2, title: tr('Outside') },
                    ]} />
            )}
            {flag(m, 'isMinLengthAvailable', false) && (
                <SpinBoxPropertyView p={prop(m, 'minLength')} title={tr('Minimum length')} unit={sp()} step={0.1} min={1} max={10} />
            )}
        </div>
    )
}

/** NotationInspectorSectionLoader: the settings view of a model (nothing for the models not ported yet) */
export function NotationInspectorSectionLoader({ m }: { m: ModelRef }): React.JSX.Element | null {
    const View = VIEWS[m.model.modelType]
    return View ? <View m={m} /> : <p className="insp-hint">{qtrc('inspector', 'Notation')}: TODO(port)</p>
}

/** the notation section: one model inline (NotationSingleElementView), several as popup buttons (NotationMultiElementView) */
export function NotationSection({ m }: { m: ModelRef }): React.JSX.Element {
    const models = m.model.models.map(x => subModel(m, x.key)!).filter(x => !x.model.isEmpty)
    if (m.model.models.length === 1 && models.length === 1) {
        return <NotationInspectorSectionLoader m={models[0]} />
    }
    return (
        <div className="insp-grid2">
            {models.map(x => (
                <PopupViewButton key={x.model.key} text={x.model.title} iconName={x.model.icon}>
                    <NotationInspectorSectionLoader m={x} />
                </PopupViewButton>
            ))}
        </div>
    )
}
