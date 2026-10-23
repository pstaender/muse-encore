/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's MeasureNumbersPage.qml (Style dialog, Measure numbers page).
 */
import { MeasureNumbersPageModel, type StyleItem } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import {
    CheckBox, Column, ComboBoxDropdown, FlatButton, FlatRadioButtons, GroupBox, Label, Row, RoundedRadioButton, RoundedRadioGroup,
    SpinBox, StyleResetButton, StyleToggle, StyledXYControllerWithReset, useNotification, useStyleModel,
} from './controls'

const tr = (s: string): string => qtrc('notation/editstyle/voltas', s)

const ALIGNMENTS = [
    { iconCode: 'ALIGN_LEFT', value: 0 },
    { iconCode: 'ALIGN_HORIZONTAL_CENTER', value: 2 },
    { iconCode: 'ALIGN_RIGHT', value: 1 },
]

export function MeasureNumbersPage({ style, goToTextStylePage }: QmlPageProps): React.JSX.Element {
    const barNumbersModel = useStyleModel(style, s => new MeasureNumbersPageModel(s))
    useNotification(barNumbersModel.measureNumberPosAboveChanged())
    const textStyles = barNumbersModel.textStyles()
    const show = barNumbersModel.showMeasureNumber().value() === true
    const showRange = barNumbersModel.mmRestShowMeasureNumberRange().value() === true
    const textStyleRow = (item: StyleItem): React.JSX.Element => (
        <Row spacing={4}>
            <div style={{ minWidth: 192 }}>
                <ComboBoxDropdown styleItem={item} model={textStyles} label={tr('Text style')} />
            </div>
            <FlatButton text={qtrc('notation', 'Edit text style')}
                onClick={() => goToTextStylePage(textStyles.findIndex(t => t.value === item.value()))} />
            <StyleResetButton styleItem={item} />
        </Row>
    )
    return (
        <Column spacing={12}>
            <GroupBox title={tr('Measure numbers')} minWidth={500}>
                <Column spacing={8}>
                    <StyleToggle styleItem={barNumbersModel.showMeasureNumber()} text={tr('Show measure numbers')} />
                    <CheckBox enabled={show} checked={barNumbersModel.showMeasureNumberOne().value() === true}
                        onClicked={() => barNumbersModel.showMeasureNumberOne().modifyValue(!barNumbersModel.showMeasureNumberOne().value())}
                        text={tr('Show initial measure number')} />
                </Column>
                <Column spacing={8} enabled={show}>
                    <Label text={tr('Text style')} />
                    {textStyleRow(barNumbersModel.measureNumberTextStyle())}
                </Column>
            </GroupBox>
            <GroupBox title={tr('Frequency')} minWidth={500} enabled={show} spacing={8}>
                <RoundedRadioButton checked={barNumbersModel.measureNumberSystem().value() === true}
                    onToggled={() => barNumbersModel.measureNumberSystem().modifyValue(true)} text={tr('Start of each system')} />
                <Row spacing={12}>
                    <RoundedRadioButton checked={barNumbersModel.measureNumberSystem().value() === false}
                        onToggled={() => barNumbersModel.measureNumberSystem().modifyValue(false)} text={tr('Every')} />
                    <SpinBox width={65} value={Number(barNumbersModel.measureNumberInterval().value())} min={1} max={99} step={1} decimals={0}
                        label={tr('Every')} onEdited={(v) => barNumbersModel.measureNumberInterval().modifyValue(v)} />
                    <Label text={tr('measures')} />
                </Row>
            </GroupBox>
            <GroupBox title={tr('Position')} minWidth={500} enabled={show}>
                <Column spacing={8}>
                    <Label text={tr('Align')} />
                    <RoundedRadioGroup styleItem={barNumbersModel.measureNumberAlignToBarline()} model={[
                        { text: tr('To the barline'), value: true },
                        { text: tr('To the measure'), value: false },
                    ]} />
                    <Label text={tr('Alignment')} />
                    <FlatRadioButtons buttonWidth={30} model={ALIGNMENTS} value={barNumbersModel.measureNumberHPlacement().value()}
                        onToggled={(v) => barNumbersModel.measureNumberHPlacement().modifyValue(v)} />
                </Column>
                <Column spacing={8}>
                    <Label text={tr('Show')} />
                    <RoundedRadioGroup styleItem={barNumbersModel.measureNumberPlacementMode()} model={[
                        { text: tr('Above system'), value: 0 },
                        { text: tr('Below system'), value: 1 },
                        { text: tr('At system marking positions'), value: 2 },
                        { text: tr('On all staves'), value: 3 },
                    ]} />
                </Column>
                {barNumbersModel.measureNumberPlacementMode().value() === 3 && (
                    <Column spacing={8}>
                        <Label text={tr('Position')} />
                        <FlatRadioButtons buttonWidth={176} value={barNumbersModel.measureNumberVPlacement().value()}
                            onToggled={(v) => barNumbersModel.measureNumberVPlacement().modifyValue(v)} model={[
                                { text: tr('Above'), value: 0 },
                                { text: tr('Below'), value: 1 },
                            ]} />
                    </Column>
                )}
                <Column spacing={8}>
                    <Row spacing={6}>
                        <Label width={156} text={tr('Offset when above staff:')} />
                        <StyledXYControllerWithReset styleItem={barNumbersModel.measureNumberPosAbove()} enabled={show} />
                    </Row>
                    <Row spacing={6}>
                        <Label width={156} text={tr('Offset when below staff:')} />
                        <StyledXYControllerWithReset styleItem={barNumbersModel.measureNumberPosBelow()} enabled={show} />
                    </Row>
                </Column>
            </GroupBox>
            <GroupBox title={tr('Measure number range at multimeasure rests')} minWidth={500}>
                <StyleToggle styleItem={barNumbersModel.mmRestShowMeasureNumberRange()} text={tr('Show measure number ranges')} />
                <Column spacing={8} enabled={showRange}>
                    <Label text={tr('Text style')} />
                    {textStyleRow(barNumbersModel.mmRestRangeTextStyle())}
                </Column>
                <Column spacing={8} enabled={showRange} style={{ width: 362 }}>
                    <Label text={tr('Bracket type')} />
                    <FlatRadioButtons value={barNumbersModel.mmRestRangeBracketType().value()} enabled={showRange}
                        onToggled={(v) => barNumbersModel.mmRestRangeBracketType().modifyValue(v)} model={[
                            { text: tr('Brackets'), value: 0 },
                            { text: tr('Parentheses'), value: 1 },
                            { text: tr('None'), value: 2 },
                        ]} />
                </Column>
                <Column spacing={8} enabled={showRange}>
                    <Label text={tr('Alignment')} />
                    <FlatRadioButtons buttonWidth={30} model={ALIGNMENTS} value={barNumbersModel.mmRestRangeHPlacement().value()}
                        enabled={showRange} onToggled={(v) => barNumbersModel.mmRestRangeHPlacement().modifyValue(v)} />
                </Column>
                <Column spacing={8} enabled={showRange} style={{ width: 362 }}>
                    <Label text={tr('Position')} />
                    <FlatRadioButtons value={barNumbersModel.mmRestRangeVPlacement().value()} enabled={showRange}
                        onToggled={(v) => barNumbersModel.mmRestRangeVPlacement().modifyValue(v)} model={[
                            { text: tr('Above'), value: 0 },
                            { text: tr('Below'), value: 1 },
                        ]} />
                </Column>
                <Column spacing={8} enabled={showRange}>
                    <Label text={tr('Offset')} />
                    <StyledXYControllerWithReset enabled={showRange} styleItem={barNumbersModel.mmRestRangeVPlacement().value() === 0
                        ? barNumbersModel.mmRestRangePosAbove() : barNumbersModel.mmRestRangePosBelow()} />
                </Column>
            </GroupBox>
        </Column>
    )
}
