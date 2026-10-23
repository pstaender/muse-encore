/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's SlursAndTiesPage.qml with SlursSection.qml, TiesSection.qml and LaissezVibrSection.qml (Style dialog,
 * Slurs & ties page).
 */
import { SlursAndTiesPageModel } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import { CheckBox, Column, FlatRadioButtons, Grid, GroupBox, Label, RoundedRadioGroup, SpinBoxGridRow, useStyleModel } from './controls'

const tr = (s: string): string => qtrc('notation/editstyle/slursandties', s)

function SlursSection({ pageModel }: { pageModel: SlursAndTiesPageModel }): React.JSX.Element {
    return (
        <GroupBox title={tr('Slurs')}>
            <Grid>
                <SpinBoxGridRow styleItem={pageModel.slurEndWidth()} label={tr('Line thickness at end:')} step={0.05} />
                <SpinBoxGridRow styleItem={pageModel.slurMidWidth()} label={tr('Line thickness middle:')} step={0.05} />
                <SpinBoxGridRow styleItem={pageModel.slurDottedWidth()} label={tr('Dotted line thickness:')} step={0.05} />
                <SpinBoxGridRow styleItem={pageModel.slurMinDistance()} label={tr('Autoplace min. distance:')} step={0.5} />
            </Grid>
            <Column spacing={8}>
                <Label text={tr('Partial slurs across repeats and breaks:')} />
                <RoundedRadioGroup styleItem={pageModel.angleHangingSlursAwayFromStaff()} model={[
                    { text: tr('Follow contour of notes'), value: false },
                    { text: tr('Angle away from staff'), value: true },
                ]} />
            </Column>
        </GroupBox>
    )
}

function TiesSection({ pageModel }: { pageModel: SlursAndTiesPageModel }): React.JSX.Element {
    return (
        <GroupBox title={tr('Ties')}>
            <Grid>
                <SpinBoxGridRow styleItem={pageModel.tieEndWidth()} label={tr('Line thickness at end:')} step={0.05} />
                <SpinBoxGridRow styleItem={pageModel.tieMidWidth()} label={tr('Line thickness middle:')} step={0.05} />
                <SpinBoxGridRow styleItem={pageModel.tieDottedWidth()} label={tr('Dotted line thickness:')} step={0.05} />
                <SpinBoxGridRow styleItem={pageModel.tieMinDistance()} label={tr('Autoplace min. distance:')} step={0.5} />
                <SpinBoxGridRow styleItem={pageModel.minTieLength()} label={tr('Minimum tie length:')} step={0.1} />
                <SpinBoxGridRow styleItem={pageModel.minHangingTieLength()} label={tr('Minimum hanging tie length:')} step={0.1} />
            </Grid>
            <Column spacing={8}>
                <Label text={qtrc('notation', 'Placement on single notes:')} />
                <FlatRadioButtons buttonWidth={106} value={pageModel.tiePlacementSingleNote().value()}
                    onToggled={(v) => pageModel.tiePlacementSingleNote().modifyValue(v)} model={[
                        { iconCode: 'TIE_INSIDE', value: 1, title: qtrc('inspector', 'Inside') },
                        { iconCode: 'TIE_OUTSIDE', value: 2, title: qtrc('inspector', 'Outside') },
                    ]} />
            </Column>
            <Column spacing={8}>
                <Label text={qtrc('notation', 'Placement on chords:')} />
                <FlatRadioButtons buttonWidth={106} value={pageModel.tiePlacementChord().value()}
                    onToggled={(v) => pageModel.tiePlacementChord().modifyValue(v)} model={[
                        { iconCode: 'TIE_CHORD_INSIDE', value: 1, title: qtrc('inspector', 'Inside') },
                        { iconCode: 'TIE_CHORD_OUTSIDE', value: 2, title: qtrc('inspector', 'Outside') },
                    ]} />
            </Column>
            <Column spacing={8}>
                <Label text={qtrc('notation', 'Placement of inner ties with respect to augmentation dots:')} />
                <RoundedRadioGroup styleItem={pageModel.tieDotsPlacement()} model={[
                    { text: qtrc('notation', 'Auto'), value: 0 },
                    { text: qtrc('notation', 'Always before dots'), value: 1 },
                    { text: qtrc('notation', 'Always after dots'), value: 2 },
                ]} />
            </Column>
        </GroupBox>
    )
}

function LaissezVibrSection({ pageModel }: { pageModel: SlursAndTiesPageModel }): React.JSX.Element {
    return (
        <GroupBox title={tr('Laissez vibrer')}>
            <Grid>
                <SpinBoxGridRow styleItem={pageModel.minLaissezVibLength()} label={tr('Minimum laissez vibrer length:')} step={0.1} />
            </Grid>
            <CheckBox text={tr('Use SMuFL symbols')} checked={pageModel.laissezVibUseSmuflSym().value() === true}
                onClicked={() => pageModel.laissezVibUseSmuflSym().modifyValue(!pageModel.laissezVibUseSmuflSym().value())} />
        </GroupBox>
    )
}

export function SlursAndTiesPage({ style }: QmlPageProps): React.JSX.Element {
    const pageModel = useStyleModel(style, s => new SlursAndTiesPageModel(s))
    return (
        <Column spacing={18}>
            <SlursSection pageModel={pageModel} />
            <TiesSection pageModel={pageModel} />
            <LaissezVibrSection pageModel={pageModel} />
        </Column>
    )
}
