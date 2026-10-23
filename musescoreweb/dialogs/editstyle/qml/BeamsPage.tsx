/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's BeamsPage.qml (Style dialog, Beams page).
 */
import { BeamsPageModel } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import {
    CheckBox, FlatRadioButtons, GroupBox, ItemWithTitle, Row, RoundedRadioGroup, SpinBox, StyleDialogPage, StyledImage, useStyleModel,
} from './controls'

export function BeamsPage({ style }: QmlPageProps): React.JSX.Element {
    const beamsPageModel = useStyleModel(style, s => new BeamsPageModel(s))
    return (
        <StyleDialogPage>
            <ItemWithTitle title={qtrc('notation', 'Beam distance')}>
                <FlatRadioButtons buttonWidth={106} buttonHeight={70} iconSize={28} spacing={12}
                    value={beamsPageModel.useWideBeams().value()}
                    onToggled={(v) => beamsPageModel.useWideBeams().modifyValue(v)}
                    model={[
                        { iconCode: 'USE_WIDE_BEAMS_REGULAR', text: qtrc('notation', 'Regular'), value: false },
                        { iconCode: 'USE_WIDE_BEAMS_WIDE', text: qtrc('notation', 'Wide'), value: true },
                    ]} />
            </ItemWithTitle>
            <ItemWithTitle title={qtrc('notation', 'Beam thickness')}>
                <SpinBox width={106} value={Number(beamsPageModel.beamWidth().value())} min={0} max={99} step={0.01} decimals={2}
                    unit={qtrc('global', 'sp')} label={qtrc('notation', 'Beam thickness')}
                    onEdited={(v) => beamsPageModel.beamWidth().modifyValue(v)} />
            </ItemWithTitle>
            <ItemWithTitle title={qtrc('notation', 'Broken beam minimum length')}>
                <SpinBox width={106} value={Number(beamsPageModel.beamMinLen().value())} min={0} max={99} step={0.05} decimals={2}
                    unit={qtrc('global', 'sp')} label={qtrc('notation', 'Broken beam minimum length')}
                    onEdited={(v) => beamsPageModel.beamMinLen().modifyValue(v)} />
            </ItemWithTitle>
            <CheckBox text={qtrc('notation', 'Flatten all beams')} checked={beamsPageModel.beamNoSlope().value() === true}
                onClicked={() => beamsPageModel.beamNoSlope().modifyValue(!beamsPageModel.beamNoSlope().value())} />
            <GroupBox title={qtrc('notation', 'Beam style')}>
                <Row spacing={12}>
                    <div style={{ flex: 1 }}>
                        <RoundedRadioGroup styleItem={beamsPageModel.frenchStyleBeams()} model={[
                            { text: qtrc('notation', 'Draw inner stems through beams'), value: false },
                            { text: qtrc('notation', 'Draw inner stems to nearest beam (“French” style)'), value: true },
                        ]} />
                    </div>
                    <StyledImage forceWidth={140} forceHeight={52} verticalPadding={12}
                        source={beamsPageModel.frenchStyleBeams().value() ? 'beamImages/beam_style_french.svg' : 'beamImages/beam_style_regular.svg'} />
                </Row>
            </GroupBox>
        </StyleDialogPage>
    )
}
