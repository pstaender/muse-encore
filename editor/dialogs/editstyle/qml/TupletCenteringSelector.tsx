/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's TupletCenteringSelector.qml (Style dialog, Tuplets page): the alignment of tuplet numbers.
 */
import { TupletCenteringSelectorModel } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import { Column, FlatRadioButtons, Label, useStyleModel } from './controls'

export function TupletCenteringSelector({ style }: QmlPageProps): React.JSX.Element {
    const model = useStyleModel(style, s => new TupletCenteringSelectorModel(s))
    return (
        <Column spacing={8}>
            <Label text={qtrc('notation/editstyle/tupletCentering', 'Number alignment')} />
            <FlatRadioButtons buttonWidth={140} buttonHeight={65} iconSize={32} spacing={8}
                value={model.tupletNumberRythmicCenter().value()}
                onToggled={(v) => model.tupletNumberRythmicCenter().modifyValue(v)}
                model={[
                    { iconCode: 'TUPLET_GRAPHICAL_CENTER', text: qtrc('notation/editstyle/tupletCentering', 'Graphical center'), value: false },
                    { iconCode: 'TUPLET_RYTHMIC_CENTER', text: qtrc('notation/editstyle/tupletCentering', 'Rhythmic center'), value: true },
                ]} />
        </Column>
    )
}
