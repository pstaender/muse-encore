/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's ClefKeyTimeSigPage.qml (Style dialog, Clefs, key & time signatures page).
 */
import { ClefKeyTimeSigPageModel, ScaleF, type StyleItem } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import {
    CheckBox, Column, FlatButton, FlatRadioButtons, GroupBox, ItemWithTitle, Label, Row, RoundedRadioButton, RoundedRadioGroup, SpinBox,
    StyledImage, ToggleButton, useStyleModel,
} from './controls'

const tr = (s: string): string => qtrc('notation/editstyle/timesignatures', s)
const toggle = (item: StyleItem): void => item.modifyValue(!item.value())

/** the component CourtesyShowAndParenToggle */
function CourtesyShowAndParenToggle({ showStyleItem, parensStyleItem, text, imageON, imageOFF, imageParens }: {
    showStyleItem: StyleItem; parensStyleItem: StyleItem; text: string; imageON: string; imageOFF: string; imageParens: string
}): React.JSX.Element {
    const checked = showStyleItem.value() === true
    const parens = parensStyleItem.value() === true
    return (
        <div className="sd-courtesy-grid">
            <ToggleButton text={text} checked={checked} onToggled={() => toggle(showStyleItem)} />
            <StyledImage forceHeight={96} horizontalPadding={0} verticalPadding={0}
                source={checked ? (parens ? imageParens : imageON) : imageOFF} />
            <CheckBox text={tr('Use parentheses')} checked={parens} enabled={checked} onClicked={() => toggle(parensStyleItem)} />
        </div>
    )
}

export function ClefKeyTimeSigPage({ style }: QmlPageProps): React.JSX.Element {
    const pageModel = useStyleModel(style, s => new ClefKeyTimeSigPageModel(s))
    const placement = pageModel.timeSigPlacement().value()
    const byPlacement = (normal: StyleItem, above: StyleItem, across: StyleItem): StyleItem =>
        placement === 0 ? normal : placement === 1 ? above : across
    const numeralStyle = byPlacement(pageModel.timeSigNormalStyle(), pageModel.timeSigAboveStyle(), pageModel.timeSigAcrossStyle())
    const timeSigAlignment = placement === 0 ? null : placement === 1 ? pageModel.timeSigCenterOnBarline() : pageModel.timeSigCenterAcrossStaveGroup()
    const timeSigScale = byPlacement(pageModel.timeSigNormalScale(), pageModel.timeSigAboveScale(), pageModel.timeSigAcrossScale())
    const scaleLock = byPlacement(pageModel.timeSigNormalScaleLock(), pageModel.timeSigAboveScaleLock(), pageModel.timeSigAcrossScaleLock())
    const numDist = byPlacement(pageModel.timeSigNormalNumDist(), pageModel.timeSigAboveNumDist(), pageModel.timeSigAcrossNumDist())
    const yPos = byPlacement(pageModel.timeSigNormalY(), pageModel.timeSigAboveY(), pageModel.timeSigAcrossY())
    const timeSigVsMargin = pageModel.timeSigCenterOnBarline().value() === true
        ? pageModel.timeSigVSMarginCentered() : pageModel.timeSigVSMarginNonCentered()
    const scale = timeSigScale.value() as ScaleF
    const labelWidth = 150
    const setScale = (w: number, h: number): void => timeSigScale.modifyValue(new ScaleF(w, h))
    const clefBeforeRepeats = pageModel.placeClefsBeforeRepeats().value() === true
    const betweenRepeats = pageModel.changesBetweenEndStartRepeat().value() === true
    const vsMargin = timeSigVsMargin.value()
    return (
        <Column spacing={12}>
            <GroupBox title={tr('Clefs')} minWidth={500} spacing={10}>
                <ItemWithTitle title={tr('Visibility:')}>
                    <RoundedRadioGroup styleItem={pageModel.genClef()} model={[
                        { text: tr('Show all clefs on every system'), value: true },
                        { text: tr('Hide all clefs after the first system where they appear'), value: false },
                    ]} />
                </ItemWithTitle>
                <CheckBox text={tr('Hide TAB clefs after the first system where they appear')} enabled={pageModel.genClef().value() === true}
                    checked={pageModel.hideTabClefAfterFirst().value() === true} onClicked={() => toggle(pageModel.hideTabClefAfterFirst())} />
                <CheckBox text={tr('Show courtesy clefs')} checked={pageModel.genCourtesyClef().value() === true}
                    onClicked={() => toggle(pageModel.genCourtesyClef())} />
                <GroupBox title={tr('Default TAB clef')}>
                    <RoundedRadioGroup styleItem={pageModel.tabClef()} model={[
                        { text: tr('Standard TAB clef'), value: 31 },
                        { text: tr('Serif TAB clef'), value: 33 },
                    ]} />
                </GroupBox>
            </GroupBox>
            <GroupBox title={tr('Time signatures')} spacing={8}>
                <Row spacing={12}>
                    <Column spacing={8} style={{ alignSelf: 'flex-start' }}>
                        <ItemWithTitle title={tr('Position:')}>
                            <RoundedRadioGroup styleItem={pageModel.timeSigPlacement()} model={[
                                { text: tr('On all staves'), value: 0 },
                                { text: tr('Above staves'), value: 1 },
                                { text: tr('Across staves'), value: 2 },
                            ]} />
                        </ItemWithTitle>
                        {placement !== 0 && <Label text={tr('Set where time signatures appear using the Layout panel.')} />}
                    </Column>
                    <StyledImage forceHeight={144} horizontalPadding={0} verticalPadding={0}
                        source={placement === 0 ? 'timeSigImages/timesig-on_all_staves.png'
                            : placement === 1 ? 'timeSigImages/timesig-above_staves.png' : 'timeSigImages/timesig-across_staves.png'} />
                </Row>
                <GroupBox title={tr('Style and size')}>
                    <Row spacing={12}>
                        <Label width={labelWidth} text={tr('Numeral style:')} />
                        <FlatRadioButtons buttonWidth={40} buttonHeight={56} iconSize={16} value={numeralStyle.value()}
                            onToggled={(v) => numeralStyle.modifyValue(v)} model={[
                                { iconCode: 'TIMESIG_STANDARD', value: 0 },
                                { iconCode: 'TIMESIG_NARROW', value: 1 },
                                { iconCode: 'TIMESIG_SANSSERIF', value: 2 },
                            ]} />
                        <FlatButton icon="UNDO" title={qtrc('global', 'Reset')}
                            enabled={!(numeralStyle.isDefault() && (!timeSigAlignment || timeSigAlignment.isDefault())
                                && timeSigScale.isDefault() && scaleLock.isDefault() && numDist.isDefault() && yPos.isDefault())}
                            onClick={() => pageModel.resetStyleAndSize()} />
                    </Row>
                    {placement !== 0 && timeSigAlignment && (
                        <Row spacing={12}>
                            <Label width={labelWidth} text={placement === 1 ? tr('Alignment with barlines:') : tr('Alignment across staves:')} />
                            <FlatRadioButtons buttonWidth={28} buttonHeight={28} iconSize={16} value={timeSigAlignment.value()}
                                onToggled={(v) => timeSigAlignment.modifyValue(v)} model={placement === 1 ? [
                                    { iconCode: 'ALIGN_LEFT', value: false },
                                    { iconCode: 'ALIGN_HORIZONTAL_CENTER', value: true },
                                ] : [
                                    { iconCode: 'ALIGN_TOP', value: false },
                                    { iconCode: 'ALIGN_VERTICAL_CENTER', value: true },
                                ]} />
                        </Row>
                    )}
                    <Row spacing={12}>
                        <Label width={labelWidth} text={tr('Scale:')} />
                        <Row spacing={6}>
                            <SpinBox width={100} decimals={2} unit="x" prefixIcon="HORIZONTAL" min={1.0} step={0.25} value={scale.width()}
                                label={tr('Scale:')}
                                onEdited={(v) => scaleLock.value() === true ? setScale(v, v) : setScale(v, scale.height())} />
                            <SpinBox width={100} decimals={2} unit="x" prefixIcon="VERTICAL" min={1.0} step={0.25} value={scale.height()}
                                label={tr('Scale:')}
                                onEdited={(v) => scaleLock.value() === true ? setScale(v, v) : setScale(scale.width(), v)} />
                            <FlatButton small icon={scaleLock.value() === true ? 'LOCK_CLOSED' : 'LOCK_OPEN'} accent={scaleLock.value() === true}
                                onClick={() => {
                                    scaleLock.modifyValue(!scaleLock.value())
                                    if (scaleLock.value() === true) {
                                        const s = timeSigScale.value() as ScaleF
                                        setScale(s.width(), s.width())
                                    }
                                }} />
                        </Row>
                    </Row>
                    <Row spacing={12}>
                        <Label width={labelWidth} text={tr('Gap between numbers (scaled):')} />
                        <SpinBox width={100} decimals={2} step={0.1} unit={qtrc('global', 'sp')} value={Number(numDist.value())}
                            label={tr('Gap between numbers (scaled):')} onEdited={(v) => numDist.modifyValue(v)} />
                    </Row>
                    <Row spacing={12} enabled={!(placement === 2 && pageModel.timeSigCenterAcrossStaveGroup().value() === true)}>
                        <Label width={labelWidth} text={tr('Vertical placement:')} />
                        <SpinBox width={100} decimals={2} unit="sp" value={Number(yPos.value())} label={tr('Vertical placement:')}
                            enabled={!(placement === 2 && pageModel.timeSigCenterAcrossStaveGroup().value() === true)}
                            onEdited={(v) => yPos.modifyValue(v)} />
                    </Row>
                </GroupBox>
                <CheckBox text={tr('Show courtesy time signatures')} checked={pageModel.genCourtesyTimesig().value() === true}
                    onClicked={() => toggle(pageModel.genCourtesyTimesig())} />
                {placement === 1 && (
                    <GroupBox enabled={pageModel.genCourtesyTimesig().value() === true}>
                        <Row spacing={12}>
                            <div style={{ flex: 1, alignSelf: 'flex-start' }}>
                                <ItemWithTitle title={tr('End-of-staff alignment:')}>
                                    <RoundedRadioButton enabled={pageModel.timeSigCenterOnBarline().value() === true}
                                        text={tr('Hang into page margin')} checked={vsMargin === 0} onToggled={() => timeSigVsMargin.modifyValue(0)} />
                                    <RoundedRadioButton text={tr('Inset time signature')} checked={vsMargin === 1}
                                        onToggled={() => timeSigVsMargin.modifyValue(1)} />
                                    <RoundedRadioButton text={tr('Inset barline')} checked={vsMargin === 2}
                                        onToggled={() => timeSigVsMargin.modifyValue(2)} />
                                </ItemWithTitle>
                            </div>
                            <StyledImage forceHeight={94} horizontalPadding={0} verticalPadding={0}
                                source={vsMargin === 0 ? 'timeSigImages/timesig-courtesy-hang.png'
                                    : vsMargin === 1 ? 'timeSigImages/timesig-courtesy-right_align.png' : 'timeSigImages/timesig-courtesy-inset.png'} />
                        </Row>
                    </GroupBox>
                )}
            </GroupBox>
            <GroupBox title={tr('Key signatures')} spacing={8}>
                <ItemWithTitle title={tr('Visibility:')}>
                    <RoundedRadioGroup styleItem={pageModel.genKeysig()} model={[
                        { text: tr('Show on every system'), value: true },
                        { text: tr('Hide after the first system where they appear'), value: false },
                    ]} />
                </ItemWithTitle>
                <CheckBox text={tr('Show courtesy key signatures')} checked={pageModel.genCourtesyKeysig().value() === true}
                    onClicked={() => toggle(pageModel.genCourtesyKeysig())} />
                <GroupBox title={qtrc('notation/editstyle/accidentals', 'When changing to a key signature containing fewer sharps or flats')} spacing={6}>
                    <RoundedRadioGroup styleItem={pageModel.keySigNaturals()} model={[
                        { text: qtrc('notation/editstyle/accidentals', 'Don’t show any naturals'), value: 0 },
                        { text: qtrc('notation/editstyle/accidentals', 'Show naturals before the new key signature'), value: 1 },
                        { text: qtrc('notation/editstyle/accidentals', 'Show naturals after the new key signature'), value: 2 },
                    ]} />
                    <CheckBox enabled={pageModel.keySigNaturals().value() !== 0}
                        text={tr('Show naturals when switching between sharps and flats')}
                        checked={pageModel.keySigShowNaturalsChangingSharpsFlats().value() === true}
                        onClicked={() => toggle(pageModel.keySigShowNaturalsChangingSharpsFlats())} />
                </GroupBox>
            </GroupBox>
            <GroupBox title={tr('Clefs, key & time signatures at repeats and jumps')}>
                <GroupBox title={tr('Changes that apply to both the repeat/jump and the subsequent measure')} spacing={8}>
                    <CheckBox text={tr('At repeats, only show changes before the barline')}
                        checked={pageModel.changesBeforeBarlineRepeats().value() === true}
                        onClicked={() => toggle(pageModel.changesBeforeBarlineRepeats())} />
                    <CheckBox text={tr('At all other jumps, only show changes before the barline')}
                        checked={pageModel.changesBeforeBarlineOtherJumps().value() === true}
                        onClicked={() => toggle(pageModel.changesBeforeBarlineOtherJumps())} />
                </GroupBox>
                <GroupBox title={tr('Changes that apply only after repeats and jumps')} spacing={8}>
                    <Row spacing={12}>
                        <Column spacing={8} style={{ flex: 1 }}>
                            <RoundedRadioButton text={tr('Place clefs before repeats')} checked={clefBeforeRepeats}
                                onToggled={() => pageModel.placeClefsBeforeRepeats().modifyValue(true)} />
                            <RoundedRadioButton text={tr('Place clefs after repeats')} checked={!clefBeforeRepeats}
                                onToggled={() => pageModel.placeClefsBeforeRepeats().modifyValue(false)} />
                        </Column>
                        <StyledImage forceHeight={64} horizontalPadding={0} verticalPadding={0}
                            source={clefBeforeRepeats ? 'courtesyImages/clefs-before_repeat.png' : 'courtesyImages/clefs-after_repeat.png'} />
                    </Row>
                    <Row spacing={12}>
                        <div style={{ flex: 1 }}>
                            <CheckBox text={tr('Allow changes between end-start repeats')} checked={betweenRepeats}
                                onClicked={() => toggle(pageModel.changesBetweenEndStartRepeat())} />
                        </div>
                        <StyledImage forceHeight={64} horizontalPadding={0} verticalPadding={0}
                            source={clefBeforeRepeats
                                ? (betweenRepeats ? 'courtesyImages/clefs-before_repeat-allow_changes' : 'courtesyImages/clefs-before_repeat-disallow_changes')
                                : (betweenRepeats ? 'courtesyImages/clefs-after_repeat-allow_changes' : 'courtesyImages/clefs-after_repeat-disallow_changes')} />
                    </Row>
                </GroupBox>
                <GroupBox title={tr('Courtesies')}>
                    <CourtesyShowAndParenToggle showStyleItem={pageModel.showCourtesiesRepeats()} parensStyleItem={pageModel.useParensRepeatCourtesies()}
                        imageON="courtesyImages/repeats-on" imageOFF="courtesyImages/repeats-off" imageParens="courtesyImages/repeats-on-parens"
                        text={tr('Show at repeats')} />
                    <CourtesyShowAndParenToggle showStyleItem={pageModel.showCourtesiesOtherJumps()}
                        parensStyleItem={pageModel.useParensOtherJumpCourtesies()}
                        imageON="courtesyImages/other_jumps-on" imageOFF="courtesyImages/other_jumps-off"
                        imageParens="courtesyImages/other_jumps-on-parens" text={tr('Show at all other jumps')} />
                    <CourtesyShowAndParenToggle showStyleItem={pageModel.showCourtesiesAfterCancellingRepeats()}
                        parensStyleItem={pageModel.useParensRepeatCourtesiesAfterCancelling()}
                        imageON="courtesyImages/cancel_repeat-on" imageOFF="courtesyImages/cancel_repeat-off"
                        imageParens="courtesyImages/cancel_repeat-on-parens" text={tr('Show when cancelling a courtesy before repeats')} />
                    <CourtesyShowAndParenToggle showStyleItem={pageModel.showCourtesiesAfterCancellingOtherJumps()}
                        parensStyleItem={pageModel.useParensOtherJumpCourtesiesAfterCancelling()}
                        imageON="courtesyImages/cancel_other-on" imageOFF="courtesyImages/cancel_other-off"
                        imageParens="courtesyImages/cancel_other-on-parens" text={tr('Show when cancelling a courtesy before all other jumps')} />
                    <CheckBox text={qtrc('notation', 'Small parentheses')} checked={pageModel.smallParens().value() === true}
                        onClicked={() => toggle(pageModel.smallParens())} />
                </GroupBox>
            </GroupBox>
        </Column>
    )
}
