/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The sections whose controls are actions: Show and Score appearance without a selection
 * (score/ScoreDisplayInspectorView.qml, score/ScoreAppearanceInspectorView.qml) and Measures for a range
 * (measures/MeasuresInspectorView.qml). Actions without a handler are disabled.
 * TODO(port): "Automatically hide all empty staves" and its options, the "Insert measures" popup (number, place).
 */
import { isActionChecked, isActionEnabled, shortcutText, triggerAction, useActions } from '../../actions/actions'
import { qtrc } from '../../i18n'
import { ActionCheckBox, flag, FlatButton, PopupViewButton, type ModelRef } from './common'

const tr = (key: string): string => qtrc('inspector', key)

function ActionCheck({ code, text, title }: { code: string; text: string; title?: string }): React.JSX.Element {
    return <ActionCheckBox text={text} title={title} checked={isActionChecked(code)} enabled={isActionEnabled(code)}
        onChange={() => triggerAction(code)} />
}

export function ScoreDisplayInspectorView(): React.JSX.Element {
    useActions()
    return (
        <div className="insp-grid2">
            <ActionCheck code="show-invisible" text={tr('Invisible')} title={tr('Invisible elements')} />
            <ActionCheck code="show-unprintable" text={tr('Formatting')} />
            <ActionCheck code="show-frames" text={tr('Frames')} />
            <ActionCheck code="show-pageborders" text={tr('Page margins')} />
            <ActionCheck code="show-soundflags" text={tr('Sound flags')} />
        </div>
    )
}

export function ScoreAppearanceInspectorView(): React.JSX.Element {
    useActions()
    return (
        <div className="insp-column">
            <ActionCheckBox text={tr('Automatically hide all empty staves')} checked={false} enabled={false} onChange={() => {}} />
            <div className="insp-grid2">
                <FlatButton text={tr('Page settings')} enabled={isActionEnabled('page-settings')} onClick={() => triggerAction('page-settings')} />
                <FlatButton text={tr('Style settings')} enabled={isActionEnabled('edit-style')} onClick={() => triggerAction('edit-style')} />
            </div>
        </div>
    )
}

function tooltip(title: string, code: string): string {
    const sc = shortcutText(code)
    return sc ? `${title} (${sc})` : title
}

export function MeasuresInspectorView({ m }: { m: ModelRef }): React.JSX.Element {
    useActions()
    const pageView = flag(m, 'scoreIsInPageView', true)
    const locked = flag(m, 'allSystemsAreLocked', false)
    const many = flag(m, 'systemCount', 0) > 1
    const insertEnabled = ['insert-measures-after-selection', 'insert-measures', 'insert-measures-at-start-of-score', 'append-measures']
        .some(isActionEnabled)
    return (
        <div className="insp-column">
            <div className="insp-row">
                <PopupViewButton text={tr('Insert measures')} iconName="PLUS" enabled={insertEnabled}>
                    {null}
                </PopupViewButton>
                <FlatButton text="" iconName="DELETE_TANK" title={tr('Delete selected measures')} enabled={isActionEnabled('time-delete')}
                    onClick={() => triggerAction('time-delete')} />
            </div>
            {pageView && (
                <div className="insp-property">
                    <div className="insp-property-title"><span>{tr('Move to system')}</span></div>
                    <div className="insp-grid2">
                        <FlatButton text={tr('Previous')} iconName="ARROW_UP" title={tooltip(tr('Move measure(s) to previous system'), 'move-measure-to-prev-system')}
                            enabled={isActionEnabled('move-measure-to-prev-system')} onClick={() => triggerAction('move-measure-to-prev-system')} />
                        <FlatButton text={tr('Next')} iconName="ARROW_DOWN" title={tooltip(tr('Move measure(s) to next system'), 'move-measure-to-next-system')}
                            enabled={isActionEnabled('move-measure-to-next-system')} onClick={() => triggerAction('move-measure-to-next-system')} />
                    </div>
                </div>
            )}
            {pageView && (
                <FlatButton iconName={locked ? 'LOCK_CLOSED' : 'LOCK_OPEN'} accent={locked}
                    text={locked ? (many ? tr('Unlock selected systems') : tr('Unlock selected system'))
                        : (many ? tr('Lock selected systems') : tr('Lock selected system'))}
                    title={tooltip(tr('Lock/unlock selected system(s)'), 'toggle-system-lock')}
                    enabled={isActionEnabled('toggle-system-lock')} onClick={() => triggerAction('toggle-system-lock')} />
            )}
            {pageView && (
                <FlatButton text={tr('Create system from selection')} title={tooltip(tr('Create system from selection'), 'make-into-system')}
                    enabled={flag(m, 'isMakeIntoSystemAvailable', false) && isActionEnabled('make-into-system')}
                    onClick={() => triggerAction('make-into-system')} />
            )}
        </div>
    )
}
