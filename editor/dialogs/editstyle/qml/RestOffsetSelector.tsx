/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's RestOffsetSelector.qml (Style dialog, Rests page): the offset of rests in multiple voices.
 */
import { RestsPageModel } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import { CheckBox, Column, FlatRadioButtons, useStyleModel } from './controls'

export function RestOffsetSelector({ style }: QmlPageProps): React.JSX.Element {
    const restsPageModel = useStyleModel(style, s => new RestsPageModel(s))
    return (
        <Column spacing={12}>
            <FlatRadioButtons buttonWidth={106} buttonHeight={30}
                value={restsPageModel.multiVoiceRestTwoSpaceOffset().value()}
                onToggled={(v) => restsPageModel.multiVoiceRestTwoSpaceOffset().modifyValue(v)}
                model={[
                    { text: qtrc('notation', '1 space'), value: false },
                    { text: qtrc('notation', '2 spaces'), value: true },
                ]} />
            <CheckBox text={qtrc('notation', 'Merge matching rests')} checked={restsPageModel.mergeMatchingRests().value() === true}
                onClicked={() => restsPageModel.mergeMatchingRests().modifyValue(!restsPageModel.mergeMatchingRests().value())} />
        </Column>
    )
}
