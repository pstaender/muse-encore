/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's HammerOnPullOffTappingPage.qml (Style dialog, Hammer-ons, pull-offs and tapping page).
 */
import { HammerOnPullOffTappingPageModel, type StyleItem } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import {
    CheckBox, Column, FlatButton, FlatRadioButtons, GroupBox, Label, Row, RoundedRadioGroup, StyledImage, ToggleButton, useStyleModel,
    type FlatRadioOption,
} from './controls'

const tr = (s: string): string => qtrc('notation/editstyle/hammeronpulloff', s)
const toggle = (item: StyleItem): void => item.modifyValue(!item.value())

function SymbolButtons({ styleItem, model }: { styleItem: StyleItem; model: readonly FlatRadioOption[] }): React.JSX.Element {
    return <FlatRadioButtons buttonWidth={40} buttonHeight={30} model={model} value={styleItem.value()} onToggled={(v) => styleItem.modifyValue(v)} />
}

export function HammerOnPullOffTappingPage({ style, goToTextStylePage }: QmlPageProps): React.JSX.Element {
    const hopoPage = useStyleModel(style, s => new HammerOnPullOffTappingPageModel(s))
    const showItems = [
        { text: tr('Half slur'), value: 0 },
        { text: tr('Symbol'), value: 1 },
        { text: tr('Both'), value: 2 },
    ]
    const lhSymbols = [
        { iconCode: 'TAPPING_ENCIRCLED_T', value: 1 },
        { iconCode: 'TAPPING_DOT', value: 0 },
    ]
    const rhSymbols = [
        { iconCode: 'TAPPING_PLUS', value: 1 },
        { iconCode: 'TAPPING_T', value: 0 },
    ]
    return (
        <Column spacing={12}>
            <GroupBox title={tr('Visibility')} minWidth={500} spacing={10}>
                <Label text={tr('Show ‘H’ and ‘P’ symbols on')} />
                <ToggleButton text={tr('Standard staves')} checked={hopoPage.showOnStandardStaves().value() === true}
                    onToggled={() => toggle(hopoPage.showOnStandardStaves())} />
                <ToggleButton text={tr('Tablature staves')} checked={hopoPage.showOnTabStaves().value() === true}
                    onToggled={() => toggle(hopoPage.showOnTabStaves())} />
            </GroupBox>
            <GroupBox title={tr('Case')} minWidth={500}>
                <Row spacing={8}>
                    <SymbolButtons styleItem={hopoPage.hopoUpperCase()} model={[
                        { iconCode: 'HP_UPPER_CASE', title: tr('Upper case'), value: true },
                        { iconCode: 'HP_LOWER_CASE', title: tr('Lower case'), value: false },
                    ]} />
                    <div className="sd-vseparator" />
                    <FlatButton text={tr('Edit text style')} onClick={() => goToTextStylePage('hammer-ons-pull-offs-and-tapping')} />
                </Row>
            </GroupBox>
            <GroupBox title={tr('Alignment')} minWidth={500} spacing={10}>
                <Label text={tr('Align ‘H’, ‘P’ and ‘T’ symbols in the same slur on')} />
                <CheckBox text={tr('Standard staves')} checked={hopoPage.hopoAlignLettersStandardStaves().value() === true}
                    onClicked={() => toggle(hopoPage.hopoAlignLettersStandardStaves())} />
                <CheckBox text={tr('Tablature staves')} checked={hopoPage.hopoAlignLettersTabStaves().value() === true}
                    onClicked={() => toggle(hopoPage.hopoAlignLettersTabStaves())} />
            </GroupBox>
            <GroupBox title={tr('Consecutive hammer-ons/pull-offs')} minWidth={500} spacing={8}>
                <RoundedRadioGroup styleItem={hopoPage.hopoShowAll()} model={[
                    { text: tr('Show ‘H’ or ‘P’ between each pair of notes'), value: true },
                    { text: tr('Show ‘H’ or ‘P’ once per group of ascending/descending notes'), value: false },
                ]} />
                <div>
                    <StyledImage forceHeight={180}
                        source={hopoPage.hopoShowAll().value() === true ? 'hammerOnPullOffImages/hopoShowAll' : 'hammerOnPullOffImages/hopoNotShowAll'} />
                </div>
            </GroupBox>
            <GroupBox title={tr('Left-hand tapping')} minWidth={500} spacing={8}>
                <Row spacing={24}>
                    <Column spacing={8}>
                        <Label text={tr('Show on standard staves')} />
                        <FlatRadioButtons buttonHeight={30} model={showItems} value={hopoPage.lhTappingShowItemsNormalStave().value()}
                            onToggled={(v) => hopoPage.lhTappingShowItemsNormalStave().modifyValue(v)} />
                    </Column>
                    <Column spacing={8} enabled={hopoPage.lhTappingShowItemsNormalStave().value() !== 0}>
                        <Label text={tr('Symbol')} />
                        <SymbolButtons styleItem={hopoPage.lhTappingSymbolNormalStave()} model={lhSymbols} />
                    </Column>
                </Row>
                <Row spacing={24}>
                    <Column spacing={8}>
                        <Label text={tr('Show on tablature staves')} />
                        <FlatRadioButtons buttonHeight={30} model={showItems} value={hopoPage.lhTappingShowItemsTab().value()}
                            onToggled={(v) => hopoPage.lhTappingShowItemsTab().modifyValue(v)} />
                    </Column>
                    <Column spacing={8} enabled={hopoPage.lhTappingShowItemsTab().value() !== 0}>
                        <Label text={tr('Symbol')} />
                        <SymbolButtons styleItem={hopoPage.lhTappingSymbolTab()} model={lhSymbols} />
                    </Column>
                </Row>
                <CheckBox enabled={hopoPage.lhTappingShowItemsTab().value() !== 1} text={tr('Slur top and bottom notes in chords')}
                    checked={hopoPage.lhTappingSlurTopAndBottomNoteOnTab().value() === true}
                    onClicked={() => toggle(hopoPage.lhTappingSlurTopAndBottomNoteOnTab())} />
            </GroupBox>
            <GroupBox title={tr('Right-hand tapping')} minWidth={500}>
                <Column spacing={8}>
                    <Label text={tr('Symbol (standard staff)')} />
                    <SymbolButtons styleItem={hopoPage.rhTappingSymbolNormalStave()} model={rhSymbols} />
                </Column>
                <Column spacing={8}>
                    <Label text={tr('Symbol (tablature staff)')} />
                    <SymbolButtons styleItem={hopoPage.rhTappingSymbolTab()} model={rhSymbols} />
                </Column>
            </GroupBox>
        </Column>
    )
}
