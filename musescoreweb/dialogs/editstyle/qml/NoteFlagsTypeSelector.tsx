/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's NoteFlagsTypeSelector.qml (Style dialog, Notes page): traditional or straight flags.
 */
import { NotesPageModel } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import { FlatRadioButtons, useStyleModel } from './controls'

export function NoteFlagsTypeSelector({ style }: QmlPageProps): React.JSX.Element {
    const notesPageModel = useStyleModel(style, s => new NotesPageModel(s))
    return (
        <FlatRadioButtons buttonWidth={106} buttonHeight={70} iconSize={32} spacing={12}
            value={notesPageModel.useStraightNoteFlags().value()}
            onToggled={(v) => notesPageModel.useStraightNoteFlags().modifyValue(v)}
            model={[
                { iconCode: 'NOTEFLAGS_TRADITIONAL', text: qtrc('notation', 'Traditional'), value: false },
                { iconCode: 'NOTEFLAGS_STRAIGHT', text: qtrc('notation', 'Straight'), value: true },
            ]} />
    )
}
