/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's ConcertPitchControl (status bar, NotationStatusBarModel::concertPitchItem): a check box with the icon and
 * title of the "concert-pitch" action; toggles it.
 */
import { actionDefinition, actionDescription, actionTitle, isActionChecked, isActionEnabled, triggerAction, useActions } from '../actions/actions'
import { stripMnemonic, useLanguage } from '../i18n'
import { useScoreView } from '../scoreview'

const CODE = 'concert-pitch'

export function ConcertPitchControl({ className = 'statusbar-button' }: { className?: string } = {}): React.JSX.Element {
    useLanguage()
    useActions()
    const v = useScoreView()
    // NotationStatusBarModel::updateConcertPitchItem: enabled with a notation
    const enabled = v.hasScore && isActionEnabled(CODE)
    const checked = enabled && isActionChecked(CODE)
    const iconCode = actionDefinition(CODE)?.icon
    return (
        <button className={`${className} concert-pitch`} role="checkbox" aria-checked={checked} disabled={!enabled}
            title={actionDescription(CODE)} onClick={() => triggerAction(CODE)}>
            <span className="statusbar-checkbox" aria-hidden="true" />
            {iconCode ? <span className="tool-icon" aria-hidden="true">{String.fromCodePoint(iconCode)}</span> : null}
            <span>{stripMnemonic(actionTitle(CODE))}</span>
        </button>
    )
}
