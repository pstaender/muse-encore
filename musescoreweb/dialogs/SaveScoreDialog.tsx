/*
 * SPDX-License-Identifier: GPL-3.0-only
 * "Save score" (Save as, and Save of a score that was never saved): MuseScore asks for the location type
 * (AskSaveLocationTypeDialog.qml) and then for a path or a cloud name (SaveToCloudDialog.qml). Here the score is saved
 * in this browser under a name, like SaveToCloudDialog: "Name", and the buttons "Save to computer" (also writes the
 * .mscz file on the computer), "Cancel" and "Save".
 */
import { useEffect, useRef, useState } from 'react'
import { canPickFiles } from '../files'
import { qtrc, useLanguage } from '../i18n'
import type { SaveAsAnswer } from '../session'

export function SaveScoreDialog({ name, onClose }: { name: string; onClose: (answer: SaveAsAnswer | null) => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const input = useRef<HTMLInputElement>(null)
    const [value, setValue] = useState(name)
    const answer = useRef<SaveAsAnswer | null>(null)
    useEffect(() => {
        ref.current?.showModal()
        input.current?.select()
    }, [])
    const valid = !!value.trim()
    const done = (toComputer: boolean): void => {
        if (valid) {
            answer.current = { name: value.trim(), toComputer }
            ref.current?.close()
        }
    }
    return (
        <dialog ref={ref} className="save-score" aria-labelledby="save-score-title" onClose={() => onClose(answer.current)}>
            <h2 id="save-score-title">{qtrc('project/save', 'Save score')}</h2>
            <form onSubmit={(e) => { e.preventDefault(); done(false) }}>
                <label className="field">
                    <span>{qtrc('project/save', 'Name')}</span>
                    <input ref={input} type="text" value={value} spellCheck={false} onChange={e => setValue(e.target.value)} />
                </label>
                <p className="muted hint">
                    {canPickFiles()
                        ? 'The score is saved in this browser. “Save to computer” also saves it as a file; “Save” then updates that file, too.'
                        : 'The score is saved in this browser. “Save to computer” also downloads it as a file.'}
                </p>
                <div className="dialog-buttons">
                    <button type="button" className="secondary save-to-computer" disabled={!valid} onClick={() => done(true)}>
                        {qtrc('project/save', 'Save to computer')}
                    </button>
                    <span className="spacer" />
                    <button type="button" className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                    <button type="submit" className="primary" value="save" disabled={!valid}>{qtrc('project/save', 'Save')}</button>
                </div>
            </form>
        </dialog>
    )
}
