/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's AccidentalsPage.qml (Style dialog, Accidentals page).
 */
import { AccidentalsPageModel } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import { Column, GroupBox, StyleSpinboxWithReset, StyleToggleWithImage, useStyleModel } from './controls'

export function AccidentalsPage({ style }: QmlPageProps): React.JSX.Element {
    const m = useStyleModel(style, s => new AccidentalsPageModel(s))
    return (
        <Column spacing={12}>
            <GroupBox title={qtrc('notation/editstyle/accidentals', 'Accidentals')}>
                <StyleSpinboxWithReset styleItem={m.bracketedAccidentalPadding()}
                    label={qtrc('notation/editstyle/accidentals', 'Padding inside parentheses:')} suffix={qtrc('global', 'sp')}
                    decimals={3} step={0.1} min={-10} max={10} labelAreaWidth={-1} controlAreaWidth={80} />
            </GroupBox>
            <GroupBox title={qtrc('notation/editstyle/accidentals', 'Multiple accidentals in chords')}>
                <StyleToggleWithImage styleItem={m.accidFollowNoteOffset()} imageON="accidentalImages/followOffset-ON.png"
                    imageOFF="accidentalImages/followOffset-OFF.png" text={qtrc('notation', 'Keep accidentals close to offset notes')} />
                <StyleToggleWithImage styleItem={m.keepAccidentalSecondsTogether()} imageON="accidentalImages/secondsAdjacent-ON.png"
                    imageOFF="accidentalImages/secondsAdjacent-OFF.png" text={qtrc('notation', 'Pair accidentals on seconds')} />
                <StyleToggleWithImage styleItem={m.alignAccidentalOctavesAcrossSubChords()} imageON="accidentalImages/octaveSubchord-ON.png"
                    imageOFF="accidentalImages/octaveSubchord-OFF.png"
                    text={qtrc('notation', 'Align accidentals an octave apart across subchords')} />
                <StyleToggleWithImage styleItem={m.alignOffsetOctaveAccidentals()} imageON="accidentalImages/octaveOffset-ON.png"
                    imageOFF="accidentalImages/octaveOffset-OFF.png" text={qtrc('notation', 'Align accidentals on offset octaves')} />
            </GroupBox>
        </Column>
    )
}
