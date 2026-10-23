/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's RepeatPage.qml (Style dialog, Repeats page): measure repeats and the repeat play count text.
 */
import { MeasureRepeatModel, RepeatPlayCountTextModel, type StyleItem } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import {
    CheckBox, Column, ComboBoxDropdown, FlatButton, GroupBox, Label, Row, SpinBox, StyleResetButton, StyleSpinboxWithReset,
    ToggleButton, useStyleModel,
} from './controls'

const toggle = (item: StyleItem): void => item.modifyValue(!item.value())

export function RepeatPage({ style, goToTextStylePage }: QmlPageProps): React.JSX.Element {
    const repeatPlayCountTextModel = useStyleModel(style, s => new RepeatPlayCountTextModel(s))
    const measureRepeatModel = useStyleModel(style, s => new MeasureRepeatModel(s))
    const showPlayCount = repeatPlayCountTextModel.repeatPlayCountShow().value() === true
    return (
        <Column spacing={12}>
            <GroupBox title={qtrc('notation', 'Measure repeats')}>
                <StyleSpinboxWithReset styleItem={measureRepeatModel.measureRepeatNumberPos()} label={qtrc('notation', 'Number position:')}
                    suffix={qtrc('global', 'sp')} min={-99} step={0.5} controlAreaWidth={130} />
                <CheckBox text={qtrc('notation', 'Show ‘1’ on 1-measure repeats')}
                    checked={measureRepeatModel.oneMeasureRepeatShow1().value() === true}
                    onClicked={() => toggle(measureRepeatModel.oneMeasureRepeatShow1())} />
                <CheckBox text={qtrc('notation', 'Show extenders on 4-measure repeats')}
                    checked={measureRepeatModel.fourMeasureRepeatShowExtenders().value() === true}
                    onClicked={() => toggle(measureRepeatModel.fourMeasureRepeatShowExtenders())} />
                <CheckBox text={qtrc('notation', 'Number consecutive measure repeats')}
                    checked={measureRepeatModel.mrNumberSeries().value() === true}
                    onClicked={() => toggle(measureRepeatModel.mrNumberSeries())} />
                <GroupBox enabled={measureRepeatModel.mrNumberSeries().value() === true}>
                    <Row spacing={12}>
                        <Label text={qtrc('notation', 'Every')} />
                        <SpinBox value={Number(measureRepeatModel.mrNumberEveryXMeasures().value())} min={0} max={99} step={1} decimals={0}
                            label={qtrc('notation', 'Every')}
                            onEdited={(v) => measureRepeatModel.mrNumberEveryXMeasures().modifyValue(v)} />
                        <Label text={qtrc('notation', 'measures')} />
                        <StyleResetButton styleItem={measureRepeatModel.mrNumberEveryXMeasures()} />
                    </Row>
                    <CheckBox text={qtrc('notation', 'With parentheses')}
                        checked={measureRepeatModel.mrNumberSeriesWithParentheses().value() === true}
                        onClicked={() => toggle(measureRepeatModel.mrNumberSeriesWithParentheses())} />
                </GroupBox>
            </GroupBox>
            <GroupBox title={qtrc('notation', 'Repeat play count text')}>
                <ToggleButton text={qtrc('notation/editstyle/repeatplaycount', 'Automatically show text at repeat barlines')}
                    checked={showPlayCount} onToggled={() => toggle(repeatPlayCountTextModel.repeatPlayCountShow())} />
                <CheckBox text={qtrc('notation/editstyle/repeatplaycount', 'Show for single repeats (e.g. “x2”)')}
                    checked={repeatPlayCountTextModel.repeatPlayCountShowSingleRepeats().value() === true} enabled={showPlayCount}
                    onClicked={() => toggle(repeatPlayCountTextModel.repeatPlayCountShowSingleRepeats())} />
                <Column spacing={8}>
                    <Label text={qtrc('notation', 'Preset')} enabled={showPlayCount} />
                    <Row spacing={6} enabled={showPlayCount}>
                        <ComboBoxDropdown styleItem={repeatPlayCountTextModel.repeatTextPreset()} enabled={showPlayCount}
                            model={repeatPlayCountTextModel.textPresetOptions()} label={qtrc('notation', 'Preset')} />
                        <FlatButton text={qtrc('notation', 'Edit text style')} enabled={showPlayCount}
                            onClick={() => goToTextStylePage('repeat-play-count')} />
                    </Row>
                </Column>
            </GroupBox>
        </Column>
    )
}
