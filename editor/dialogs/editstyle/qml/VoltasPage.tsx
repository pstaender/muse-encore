/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's VoltasPage.qml (Style dialog, Voltas page).
 */
import { VoltasPageModel, type PointF } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import {
    Column, GroupBox, Label, RadioButtonSelectorWithReset, Row, RoundedRadioGroup, SpinBox, StyleResetButton, StyleSpinboxWithReset,
    StyledImage, setPointY, useStyleModel,
} from './controls'

const tr = (s: string): string => qtrc('notation/editstyle/voltas', s)

export function VoltasPage({ style }: QmlPageProps): React.JSX.Element {
    const voltasPage = useStyleModel(style, s => new VoltasPageModel(s))
    const dashed = voltasPage.voltaLineStyle().value() === 1
    return (
        <Column spacing={12}>
            <GroupBox title={tr('Voltas')} minWidth={500}>
                <Row spacing={8}>
                    <Label text={tr('Vertical position:')} />
                    <SpinBox value={(voltasPage.voltaPosAbove().value() as PointF).y()} unit={qtrc('global', 'sp')} max={0} min={-100}
                        decimals={2} step={0.25} label={tr('Vertical position:')}
                        onEdited={(v) => setPointY(voltasPage.voltaPosAbove(), v)} />
                    <StyleResetButton styleItem={voltasPage.voltaPosAbove()} />
                </Row>
                <StyleSpinboxWithReset styleItem={voltasPage.voltaHook()} label={tr('Hook height:')} suffix={qtrc('global', 'sp')}
                    labelAreaWidth={160} controlAreaWidth={100} spinBoxWidth={100} />
                <StyleSpinboxWithReset styleItem={voltasPage.voltaLineWidth()} label={tr('Line thickness:')} suffix={qtrc('global', 'sp')}
                    labelAreaWidth={160} controlAreaWidth={100} spinBoxWidth={100} />
                <RadioButtonSelectorWithReset styleItem={voltasPage.voltaLineStyle()} label={qtrc('notation', 'Line style:')}
                    labelAreaWidth={160} controlAreaWidth={276} model={[
                        { iconCode: 'LINE_NORMAL', value: 0, title: qtrc('notation', 'Normal') },
                        { iconCode: 'LINE_DASHED', value: 1, title: qtrc('notation', 'Dashed') },
                        { iconCode: 'LINE_DOTTED', value: 2, title: qtrc('notation', 'Dotted') },
                    ]} />
                <StyleSpinboxWithReset visible={dashed} styleItem={voltasPage.voltaDashLineLen()} label={tr('Dash:')}
                    labelAreaWidth={160} controlAreaWidth={100} spinBoxWidth={100} />
                <StyleSpinboxWithReset visible={dashed} styleItem={voltasPage.voltaDashGapLen()} label={tr('Gap:')}
                    labelAreaWidth={160} controlAreaWidth={100} spinBoxWidth={100} />
            </GroupBox>
            <GroupBox title={tr('Alignment')} minWidth={500}>
                <Row spacing={16}>
                    <StyledImage horizontalPadding={0} verticalPadding={0} forceHeight={96}
                        source={voltasPage.voltaAlignStartBeforeKeySig().value() === false
                            ? 'voltasImages/voltaAfterKeySig.png' : 'voltasImages/voltaBeforeKeySig.png'} />
                    <Column spacing={8}>
                        <Label text={tr('At start of system, start volta:')} />
                        <RoundedRadioGroup styleItem={voltasPage.voltaAlignStartBeforeKeySig()} model={[
                            { text: tr('After key signature'), value: false },
                            { text: tr('On key signature'), value: true },
                        ]} />
                    </Column>
                </Row>
                <Row spacing={16}>
                    <StyledImage horizontalPadding={0} verticalPadding={0} forceHeight={96}
                        source={voltasPage.voltaAlignEndLeftOfBarline().value() === false
                            ? 'voltasImages/voltaRightOfBarline.png' : 'voltasImages/voltaLeftOfBarline.png'} />
                    <Column spacing={8}>
                        <Label text={tr('Align start hook:')} />
                        <RoundedRadioGroup styleItem={voltasPage.voltaAlignEndLeftOfBarline()} model={[
                            { text: tr('To right side of barlines'), value: false },
                            { text: tr('To left side of barlines'), value: true },
                        ]} />
                    </Column>
                </Row>
            </GroupBox>
        </Column>
    )
}
