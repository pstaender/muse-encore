/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The General section (port of src/inspector/qml/MuseScore/Inspector/general/GeneralInspectorView.qml and
 * general/appearance/AppearanceSettings.qml with its HorizontalSpacingSection, VerticalSpacingSection,
 * AppearanceOffsetSection, ArrangeSection, ColorSection).
 * TODO(port): the Playback popup (PlaybackSettings), snap to grid / "Configure grid", "Save as default style".
 */
import { useContext } from 'react'
import { inspectorArrangeChanges, type InspectorArrangeCommand } from '../../../src/index'
import { qtrc } from '../../i18n'
import { applyInspectorChanges, scoreChanged } from '../editbridge'
import {
    ColorSection, flag, FlatButton, InspectorContext, OffsetSection, PopupViewButton, prop, PropertyCheckBox, PropertyView,
    Separator, SpinBoxPropertyView, subModel, type ModelRef,
} from './common'

function ArrangeSection({ m }: { m: ModelRef | null }): React.JSX.Element | null {
    const ctx = useContext(InspectorContext)
    const p = prop(m, 'arrangeOrder')
    if (!p) {
        return null
    }
    const arrange = (command: InspectorArrangeCommand): void => {
        if (ctx.score && applyInspectorChanges(ctx.score, inspectorArrangeChanges(ctx.score, command))) {
            scoreChanged()
        }
    }
    const enabled = ctx.canEdit && p.info.isEnabled
    return (
        <PropertyView p={p} title={qtrc('inspector', 'Arrange')}>
            <div className="insp-grid2">
                <FlatButton text={qtrc('inspector', 'Forwards')} enabled={enabled} onClick={() => arrange('forwards')} />
                <FlatButton text={qtrc('inspector', 'To front')} enabled={enabled} onClick={() => arrange('toFront')} />
                <FlatButton text={qtrc('inspector', 'Backwards')} enabled={enabled} onClick={() => arrange('backwards')} />
                <FlatButton text={qtrc('inspector', 'To back')} enabled={enabled} onClick={() => arrange('toBack')} />
            </div>
        </PropertyView>
    )
}

function AppearanceSettings({ m }: { m: ModelRef | null }): React.JSX.Element {
    const sp = qtrc('global', 'sp')
    return (
        <div className="insp-column">
            <div className="insp-row">
                <SpinBoxPropertyView p={prop(m, 'leadingSpace')} title={qtrc('inspector', 'Leading space')} unit={sp} half />
                <SpinBoxPropertyView p={prop(m, 'measureWidth')} title={qtrc('inspector', 'Measure width')} unit="%" decimals={0}
                    step={5} min={0} max={1000} half />
            </div>
            <Separator />
            <SpinBoxPropertyView p={prop(m, 'minimumDistance')} title={qtrc('inspector', 'Minimum distance')} unit={sp} />
            <Separator />
            <OffsetSection p={prop(m, 'offset')} units={flag(m, 'measurementUnits', 'sp')}
                verticalAvailable={flag(m, 'isVerticalOffsetAvailable', true)} />
            <Separator />
            <ArrangeSection m={m} />
            <Separator />
            <ColorSection p={prop(m, 'color')} />
        </div>
    )
}

export function GeneralInspectorView({ m }: { m: ModelRef }): React.JSX.Element {
    const appearance = subModel(m, 'appearance')
    const available = flag(m, 'areGeneralPropertiesAvailable', true)
    return (
        <div className={`insp-column${available ? '' : ' disabled'}`}>
            <div className="insp-grid2">
                <PropertyCheckBox p={prop(m, 'isVisible')} text={qtrc('inspector', 'Visible')} />
                <PropertyCheckBox p={prop(m, 'isSmall')} text={qtrc('inspector', 'Cue size')} />
                <PropertyCheckBox p={prop(m, 'isAutoPlaceAllowed')} text={qtrc('inspector', 'Auto-place')} />
                <PropertyCheckBox p={prop(m, 'isPlayable')} text={qtrc('inspector', 'Play')} />
            </div>
            <div className="insp-grid2">
                <PopupViewButton text={qtrc('inspector', 'Playback')} iconName="AUDIO" enabled={false}>
                    {null}
                </PopupViewButton>
                <PopupViewButton text={qtrc('inspector', 'Appearance')} iconName="POSITION_ARROWS" enabled={!!appearance && !appearance.model.isEmpty}>
                    <AppearanceSettings m={appearance} />
                </PopupViewButton>
            </div>
        </div>
    )
}
