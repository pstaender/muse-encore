/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The editing and note input actions of the open score (MuseScore's NotationActionController, in the library:
 * executeAction). After each command the score view is updated (new layout, selection, status bar, modified flag).
 */
import {
    executeAction, isTextEditingAction, isActionChecked as isScoreActionChecked, isActionEnabled as isScoreActionEnabled, isCheckableAction,
    notationActionCodes,
} from '../../src/index'
import { currentScore, scoreChanged, scoreViewState } from '../scoreview'
import { session } from '../session'
import { registerAction } from './actions'

const scoreShown = (): boolean => scoreViewState().hasScore && session().view === 'score'

export function registerNotationActions(): void {
    for (const code of notationActionCodes()) {
        registerAction(code, {
            run: () => {
                const score = currentScore()
                if (score && executeAction(score, code)) {
                    scoreChanged()
                }
            },
            enabled: () => {
                const score = currentScore()
                return !!score && scoreShown() && isScoreActionEnabled(score, code)
            },
            checked: isCheckableAction(code) ? () => {
                const score = currentScore()
                return !!score && scoreShown() && isScoreActionChecked(score, code)
            } : undefined,
            context: 'notation',
            priority: isTextEditingAction(code) ? 1 : 0,
        })
    }
}
