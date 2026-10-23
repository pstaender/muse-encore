/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's IInteractive::error / warning / question message boxes: a text, an optional detail text and buttons; the promise
 * resolves with the clicked button (or 'cancel' if the box was closed with Escape).
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { qtrc, useLanguage } from '../i18n'

export type MessageButton = 'ok' | 'cancel' | 'yes' | 'no'

interface Message {
    key: number
    text: string
    detail: string
    buttons: MessageButton[]
    resolve: (button: MessageButton) => void
}

let s_message: Message | null = null
let s_key = 0
const listeners = new Set<() => void>()

function setMessage(m: Message | null): void {
    s_message = m
    for (const l of listeners) {
        l()
    }
}

/** IInteractive::error / warning: shows the message and resolves with the clicked button */
export function showMessage(text: string, detail = '', buttons: MessageButton[] = ['ok']): Promise<MessageButton> {
    return new Promise(resolve => setMessage({ key: ++s_key, text, detail, buttons, resolve }))
}

function MessageBox({ message }: { message: Message }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    useEffect(() => {
        ref.current?.showModal()
    }, [])
    return (
        <dialog ref={ref} className="confirm message-box" aria-labelledby="message-box-text"
            onClose={() => {
                const v = ref.current?.returnValue
                setMessage(null)
                message.resolve(v === 'ok' || v === 'yes' || v === 'no' ? v : message.buttons.includes('no') ? 'no' : 'cancel')
            }}>
            <p id="message-box-text"><strong>{message.text}</strong></p>
            {message.detail && <p>{message.detail}</p>}
            <form method="dialog" className="dialog-buttons">
                {message.buttons.includes('no') && <button className="secondary" value="no">{qtrc('global', 'No')}</button>}
                {message.buttons.includes('yes') && <button className="primary" value="yes" autoFocus>{qtrc('global', 'Yes')}</button>}
                {message.buttons.includes('cancel') && <button className="secondary" value="cancel">{qtrc('global', 'Cancel')}</button>}
                {message.buttons.includes('ok') && <button className="primary" value="ok" autoFocus>{qtrc('global', 'OK')}</button>}
            </form>
        </dialog>
    )
}

export function MessageBoxHost(): React.JSX.Element | null {
    const message = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_message)
    return message ? <MessageBox key={message.key} message={message} /> : null
}
