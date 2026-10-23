/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's FretboardsPage.qml (Style dialog, Fretboard diagrams page).
 */
import { FretboardsPageModel } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import {
    CheckBox, Column, FlatButton, GroupBox, IconAndTextButtonSelector, Label, Row, RoundedRadioButton, StyleSpinboxWithReset, TextField,
    useStyleModel,
} from './controls'

const controlAreaWidth = 204

export function FretboardsPage({ style, goToTextStylePage }: QmlPageProps): React.JSX.Element {
    const fretboardsPage = useStyleModel(style, s => new FretboardsPageModel(s))
    const vertical = fretboardsPage.fretOrientation().value() === 0
    const customSuffix = fretboardsPage.fretUseCustomSuffix().value() === true
    return (
        <GroupBox title={qtrc('notation', 'Fretboard diagrams')}>
            <StyleSpinboxWithReset styleItem={fretboardsPage.fretY()} label={qtrc('notation', 'Position above staff:')}
                suffix={qtrc('global', 'sp')} controlAreaWidth={controlAreaWidth} step={0.05} />
            <StyleSpinboxWithReset styleItem={fretboardsPage.fretMinDistance()} label={qtrc('notation', 'Min. space to notation:')}
                suffix={qtrc('global', 'sp')} controlAreaWidth={controlAreaWidth} step={0.05} />
            <StyleSpinboxWithReset styleItem={fretboardsPage.fretMag()} label={qtrc('notation', 'Scale:')} inPercentage
                controlAreaWidth={controlAreaWidth} />
            <IconAndTextButtonSelector styleItem={fretboardsPage.fretOrientation()} label={qtrc('notation', 'Orientation:')}
                controlAreaWidth={controlAreaWidth} model={[
                    { iconCode: 'FRETBOARD_VERTICAL', text: qtrc('notation', 'Vertical'), value: 0 },
                    { iconCode: 'FRETBOARD_HORIZONTAL', text: qtrc('notation', 'Horizontal'), value: 1 },
                ]} />
            <StyleSpinboxWithReset styleItem={fretboardsPage.fretNutThickness()} label={qtrc('notation', 'Nut line thickness:')}
                suffix={qtrc('global', 'sp')} controlAreaWidth={controlAreaWidth} />
            <GroupBox title={qtrc('notation', 'Fret number')}>
                <Row spacing={12}>
                    <Label text={qtrc('notation', 'Position:')} />
                    <RoundedRadioButton text={vertical ? qtrc('notation', 'Left') : qtrc('notation', 'Bottom')}
                        checked={fretboardsPage.fretNumPos().value() === 0} onToggled={() => fretboardsPage.fretNumPos().modifyValue(0)} />
                    <RoundedRadioButton text={vertical ? qtrc('notation', 'Right') : qtrc('notation', 'Top')}
                        checked={fretboardsPage.fretNumPos().value() === 1} onToggled={() => fretboardsPage.fretNumPos().modifyValue(1)} />
                </Row>
                <GroupBox title={qtrc('notation', 'Format:')}>
                    <RoundedRadioButton text={qtrc('notation', 'Number only')} checked={!customSuffix}
                        onToggled={() => fretboardsPage.fretUseCustomSuffix().modifyValue(false)} />
                    <Row spacing={8}>
                        <RoundedRadioButton text={qtrc('notation', 'Custom suffix:')} checked={customSuffix}
                            onToggled={() => fretboardsPage.fretUseCustomSuffix().modifyValue(true)} />
                        <TextField width={60} live enabled={customSuffix} value={String(fretboardsPage.fretCustomSuffix().value() ?? '')}
                            label={qtrc('notation', 'Custom suffix:')} onEdited={(v) => fretboardsPage.fretCustomSuffix().modifyValue(v)} />
                        {customSuffix && <Label text={qtrc('notation', 'Preview:') + ' 3' + String(fretboardsPage.fretCustomSuffix().value() ?? '')} />}
                    </Row>
                </GroupBox>
                <div>
                    <FlatButton text={qtrc('notation', 'Edit fret number text style')}
                        onClick={() => goToTextStylePage('fretboard-diagram-fret-number')} />
                </div>
            </GroupBox>
            <StyleSpinboxWithReset styleItem={fretboardsPage.fretDotSpatiumSize()} label={qtrc('notation', 'Dot size:')}
                suffix={qtrc('global', 'sp')} controlAreaWidth={controlAreaWidth} />
            <GroupBox title={qtrc('notation', 'Barré')}>
                <IconAndTextButtonSelector styleItem={fretboardsPage.barreAppearanceSlur()} label={qtrc('notation', 'Appearance:')}
                    controlAreaWidth={controlAreaWidth} model={[
                        { iconCode: 'FRETBOARD_BARRE_LINE', text: qtrc('notation', 'Line'), value: false },
                        { iconCode: 'FRETBOARD_BARRE_SLUR', text: qtrc('notation', 'Slur'), value: true },
                    ]} />
                <StyleSpinboxWithReset styleItem={fretboardsPage.barreLineWidth()} label={qtrc('notation', 'Line thickness:')} inPercentage
                    controlAreaWidth={controlAreaWidth} />
            </GroupBox>
            <Column spacing={12}>
                <CheckBox text={qtrc('notation', 'Show fingerings')} checked={fretboardsPage.fretShowFingerings().value() === true}
                    onClicked={() => fretboardsPage.fretShowFingerings().modifyValue(!fretboardsPage.fretShowFingerings().value())} />
                <div>
                    <FlatButton text={qtrc('notation', 'Edit fingering text style')}
                        onClick={() => goToTextStylePage('fretboard-diagram-fingering')} />
                </div>
            </Column>
            <IconAndTextButtonSelector styleItem={fretboardsPage.fretStyleExtended()} label={qtrc('notation', 'Fretboard style:')}
                controlAreaWidth={controlAreaWidth} model={[
                    { iconCode: 'FRETBOARD_VERTICAL', text: qtrc('notation', 'Trimmed'), value: false },
                    { iconCode: 'FRETBOARD_EXTENDED', text: qtrc('notation', 'Extended'), value: true },
                ]} />
            <StyleSpinboxWithReset styleItem={fretboardsPage.fretStringSpacing()} label={qtrc('notation', 'String spacing:')}
                suffix={qtrc('global', 'sp')} controlAreaWidth={controlAreaWidth} />
            <StyleSpinboxWithReset styleItem={fretboardsPage.fretFretSpacing()} label={qtrc('notation', 'Fret spacing:')}
                suffix={qtrc('global', 'sp')} controlAreaWidth={controlAreaWidth} />
        </GroupBox>
    )
}
