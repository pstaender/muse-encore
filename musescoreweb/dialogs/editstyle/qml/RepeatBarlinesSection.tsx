/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's RepeatBarlinesSection.qml (Style dialog, Barlines page): barlines before key and time signature changes.
 */
import { RepeatBarlinesSectionModel } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import { CheckBox, Column, ToggleButton, useStyleModel } from './controls'

export function RepeatBarlinesSection({ style }: QmlPageProps): React.JSX.Element {
    const m = useStyleModel(style, s => new RepeatBarlinesSectionModel(s))
    const toggle = (item: ReturnType<typeof m.barlineBeforeSigChange>): void => item.modifyValue(!item.value())
    const enabled = m.barlineBeforeSigChange().value() === true
    return (
        <Column spacing={12}>
            <ToggleButton text={qtrc('notation/editstyle/barlines', 'Show barline before key and time signature changes')}
                checked={enabled} onToggled={() => toggle(m.barlineBeforeSigChange())} />
            <CheckBox text={qtrc('notation/editstyle/barlines', 'Use double barline before key signatures')} enabled={enabled}
                checked={m.doubleBarlineBeforeKeySig().value() === true} onClicked={() => toggle(m.doubleBarlineBeforeKeySig())} />
            <CheckBox text={qtrc('notation/editstyle/barlines', 'Use double barline before time signatures')} enabled={enabled}
                checked={m.doubleBarlineBeforeTimeSig().value() === true} onClicked={() => toggle(m.doubleBarlineBeforeTimeSig())} />
        </Column>
    )
}
