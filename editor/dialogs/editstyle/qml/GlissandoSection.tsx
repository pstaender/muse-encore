/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's GlissandoSection.qml (Style dialog, Glissando/note-anchored line page).
 */
import { GlissandoSectionModel } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import { CheckBox, Column, FlatButton, LineStyleSection, RadioButtonSelectorWithReset, TextFieldWithReset, useStyleModel } from './controls'

export function GlissandoSection({ style, goToTextStylePage }: QmlPageProps): React.JSX.Element {
    const m = useStyleModel(style, s => new GlissandoSectionModel(s))
    return (
        <Column spacing={12}>
            <RadioButtonSelectorWithReset styleItem={m.glissandoLineType()} label={qtrc('notation', 'Line type:')} model={[
                { text: qtrc('notation', 'Straight'), value: 0 },
                { text: qtrc('notation', 'Wavy'), value: 1 },
            ]} />
            <LineStyleSection lineStyle={m.glissandoLineStyle()} dashLineLength={m.glissandoLineStyleDashSize()}
                dashGapLength={m.glissandoLineStyleGapSize()} lineWidth={m.glissandoLineWidth()} />
            <TextFieldWithReset styleItem={m.glissandoText()} labelComponent={
                <CheckBox text={qtrc('notation', 'Show text:')} checked={Boolean(m.glissandoShowText().value())}
                    onClicked={() => m.glissandoShowText().modifyValue(!m.glissandoShowText().value())} />
            } />
            <div>
                <FlatButton text={qtrc('notation', 'Edit glissando text style')} onClick={() => goToTextStylePage('glissando')} />
            </div>
        </Column>
    )
}
