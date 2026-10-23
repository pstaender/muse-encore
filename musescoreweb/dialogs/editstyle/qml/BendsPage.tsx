/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's BendsPage.qml (Style dialog, Bends page): bends, dives, whammy bar lines, grace note bends, interval labels.
 */
import { BendsPageModel, type StyleItem } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import {
    CheckBox, Column, FlatButton, FlatRadioButtons, GroupBox, Label, LineStyleSection, Row, RoundedRadioGroup, SpinBox,
    StyleControlRowWithReset, TextField, useStyleModel,
} from './controls'

const tr = (s: string): string => qtrc('notation/editstyle/bends', s)

function SpinBoxRow({ styleItem, label, step }: { styleItem: StyleItem; label: string; step: number }): React.JSX.Element | null {
    return (
        <StyleControlRowWithReset styleItem={styleItem} label={label} controlAreaWidth={100}>
            <SpinBox value={Number(styleItem.value())} unit={qtrc('global', 'sp')} step={step} label={label}
                onEdited={(v) => styleItem.modifyValue(v)} />
        </StyleControlRowWithReset>
    )
}

export function BendsPage({ style, goToTextStylePage }: QmlPageProps): React.JSX.Element {
    const bendsModel = useStyleModel(style, s => new BendsPageModel(s))
    return (
        <Column spacing={12}>
            <GroupBox title={tr('Bends')} minWidth={500} spacing={8}>
                <GroupBox title={tr('Standard staff')}>
                    <SpinBoxRow styleItem={bendsModel.guitarBendLineWidth()} label={tr('Line thickness:')} step={0.01} />
                </GroupBox>
                <GroupBox title={tr('Tablature staff')} spacing={8}>
                    <SpinBoxRow styleItem={bendsModel.guitarBendLineWidthTab()} label={tr('Line thickness:')} step={0.01} />
                    <Row spacing={12}>
                        <SpinBoxRow styleItem={bendsModel.guitarBendArrowWidth()} label={tr('Arrow width:')} step={0.1} />
                        <SpinBoxRow styleItem={bendsModel.guitarBendArrowHeight()} label={tr('Arrow height:')} step={0.1} />
                    </Row>
                    <StyleControlRowWithReset styleItem={bendsModel.guitarBendUseFull()} label={tr('Label for full bends:')} hasReset={false}>
                        <FlatRadioButtons buttonWidth={106} buttonHeight={60} iconSize={28} value={bendsModel.guitarBendUseFull().value()}
                            onToggled={(v) => bendsModel.guitarBendUseFull().modifyValue(v)} model={[
                                { iconCode: 'GUITAR_BEND_STYLE_1', value: false, iconSize: 28 },
                                { iconCode: 'GUITAR_BEND_STYLE_FULL', value: true, iconSize: 28 },
                            ]} />
                    </StyleControlRowWithReset>
                </GroupBox>
            </GroupBox>
            <GroupBox title={tr('Dives')} minWidth={500} spacing={8}>
                <GroupBox title={tr('Standard staff')}>
                    <SpinBoxRow styleItem={bendsModel.guitarDiveLineWidth()} label={tr('Line thickness:')} step={0.01} />
                </GroupBox>
                <GroupBox title={tr('Tablature staff')} spacing={8}>
                    <Label text={tr('Show dive lines')} />
                    <RoundedRadioGroup styleItem={bendsModel.guitarDivesAboveStaff()} model={[
                        { text: tr('On the staff'), value: false },
                        { text: tr('Above the staff'), value: true },
                    ]} />
                    <SpinBoxRow styleItem={bendsModel.guitarDiveLineWidthTab()} label={tr('Line thickness:')} step={0.01} />
                </GroupBox>
                <GroupBox title={tr('Whammy bar line')} spacing={8}>
                    <Row spacing={12}>
                        <StyleControlRowWithReset styleItem={bendsModel.whammyBarText()} label={tr('Text label:')} controlAreaWidth={100}>
                            <TextField width={100} value={String(bendsModel.whammyBarText().value() ?? '')} label={tr('Text label:')}
                                onEdited={(v) => bendsModel.whammyBarText().modifyValue(v)} />
                        </StyleControlRowWithReset>
                        <div className="sd-vseparator" />
                        <FlatButton text={qtrc('notation', 'Edit text style')} onClick={() => goToTextStylePage('whammy-bar')} />
                    </Row>
                    <LineStyleSection lineStyle={bendsModel.whammyBarLineStyle()} dashLineLength={bendsModel.whammyBarDashLineLen()}
                        dashGapLength={bendsModel.whammyBarDashGapLen()} lineWidth={bendsModel.whammyBarLineWidth()} />
                </GroupBox>
            </GroupBox>
            <GroupBox title={tr('Grace note bends/dives on tablature')} minWidth={500}>
                <CheckBox text={tr('Use cue sized fret numbers')} checked={bendsModel.useCueSizeFretForGraceBends().value() === true}
                    onClicked={() => bendsModel.useCueSizeFretForGraceBends().modifyValue(!bendsModel.useCueSizeFretForGraceBends().value())} />
                <Column spacing={8}>
                    <Label text={tr('Align pre-bends and pre-dives')} />
                    <RoundedRadioGroup styleItem={bendsModel.alignPreBendAndPreDiveToGraceNote()} model={[
                        { text: tr('To the main note'), value: false },
                        { text: tr('To the grace note'), value: true },
                    ]} />
                </Column>
            </GroupBox>
            <GroupBox title={tr('Interval labels')} minWidth={500}>
                <Row spacing={12}>
                    <FlatRadioButtons buttonWidth={132} buttonHeight={52} iconSize={16} value={bendsModel.useFractionCharacters().value()}
                        onToggled={(v) => bendsModel.useFractionCharacters().modifyValue(v)} model={[
                            { iconCode: 'FRACTION_DIAGONAL', text: tr('Diagonal'), value: true },
                            { iconCode: 'FRACTION_LEVEL', text: tr('Level'), value: false },
                        ]} />
                    <div className="sd-vseparator" />
                    <FlatButton text={qtrc('notation', 'Edit text style')} onClick={() => goToTextStylePage('bend')} />
                </Row>
            </GroupBox>
        </Column>
    )
}
