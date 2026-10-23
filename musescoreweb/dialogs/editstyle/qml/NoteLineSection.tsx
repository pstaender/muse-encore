/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's NoteLineSection.qml (Style dialog, Glissando/note-anchored line page).
 */
import { NoteLineSectionModel } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import { Column, FlatButton, LineStyleSection, useStyleModel } from './controls'

export function NoteLineSection({ style, goToTextStylePage }: QmlPageProps): React.JSX.Element {
    const m = useStyleModel(style, s => new NoteLineSectionModel(s))
    return (
        <Column spacing={12}>
            <LineStyleSection lineStyle={m.noteLineStyle()} dashLineLength={m.noteLineStyleDashSize()}
                dashGapLength={m.noteLineStyleGapSize()} lineWidth={m.noteLineWidth()} />
            <div>
                <FlatButton text={qtrc('notation', 'Edit note-anchored line text style')} onClick={() => goToTextStylePage('note-line')} />
            </div>
        </Column>
    )
}
