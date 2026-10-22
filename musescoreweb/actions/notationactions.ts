/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The editing and note input actions of the open score (MuseScore's NotationActionController, in the library:
 * executeAction). After each command the score view is updated (new layout, selection, status bar, modified flag).
 */
import {
    changeInstrumentChange, executeAction, isTextEditingAction, selectedInstrumentChange, isActionChecked as isScoreActionChecked, isActionEnabled as isScoreActionEnabled, isCheckableAction,
    notationActionCodes, clipboardContents,
} from '../../src/index'
import { currentScore, scoreChanged, scoreViewState } from '../scoreview'
import { session } from '../session'
import { registerAction } from './actions'
import { askInstrument } from '../dialogs/SelectInstrumentDialog'
import { withSelectedInstrument } from '../dialogs/instrumentchoice'

const scoreShown = (): boolean => scoreViewState().hasScore && session().view === 'score'

export function registerNotationActions(): void {
    for (const code of notationActionCodes()) {
        registerAction(code, {
            run: () => {
                const score = currentScore()
                if (!score) {
                    return
                }
                if (code === 'instrument-change-text') {
                    // the instrument of the new instrument change is chosen first (NotationInteraction::selectInstrument)
                    void withSelectedInstrument(() => {
                        if (executeAction(score, code)) {
                            scoreChanged()
                        }
                    })
                    return
                }
                if (executeAction(score, code)) {
                    scoreChanged()
                    if (code === 'copy-lyrics-to-clipboard') {
                        // NotationInteraction::copyLyrics sets the text of the (system) clipboard
                        void navigator.clipboard?.writeText(clipboardContents()['text/plain'] ?? '').catch(() => {})
                    }
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

    // InstrumentsActionsController::changeInstrument: "Select instrument…" of the selected instrument change
    registerAction('change-instrument', {
        run: () => {
            const score = currentScore()
            if (!score || !selectedInstrumentChange(score)) {
                return
            }
            void askInstrument().then(templateId => {
                if (templateId && currentScore() === score && changeInstrumentChange(score, templateId)) {
                    scoreChanged()
                }
            })
        },
        enabled: () => {
            const score = currentScore()
            return !!score && scoreShown() && !!selectedInstrumentChange(score)
        },
        context: 'notation',
    })
}
