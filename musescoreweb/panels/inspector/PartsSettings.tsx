/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Port of src/inspector/qml/MuseScore/Inspector/parts/PartsSettings.qml: "Score and part synchronization".
 */
import { qtrc } from '../../i18n'
import { flag, prop, PropertyCheckBox, PropertyToggle, type ModelRef } from './common'

const tr = (s: string): string => qtrc('inspector', s)

export function PartsSettings({ m }: { m: ModelRef }): React.JSX.Element {
    const exclude = prop(m, 'excludeFromOtherParts')
    // the link options are disabled while the element is excluded from the score
    const excluded = !!exclude && exclude.info.isVisible && flag(m, 'showExcludeOption', false) && !!exclude.info.value
    return (
        <div className="insp-column">
            {flag(m, 'showPartLinkingOption', false) && (
                <div className={`insp-column${excluded ? ' disabled' : ''}`} inert={excluded}>
                    <div>{tr('Synchronize with main score')}</div>
                    <PropertyToggle p={prop(m, 'positionLinkedToMaster')} text={tr('Position')} />
                    <PropertyToggle p={prop(m, 'appearanceLinkedToMaster')} text={tr('Style/appearance')} />
                    {flag(m, 'showTextLinkingOption', false) && <PropertyToggle p={prop(m, 'textLinkedToMaster')} text={tr('Text')} />}
                </div>
            )}
            {flag(m, 'showExcludeOption', false) && (
                <PropertyCheckBox p={exclude}
                    text={flag(m, 'isMasterScore', true) ? tr('Exclude from parts') : tr('Exclude from score')} />
            )}
        </div>
    )
}
