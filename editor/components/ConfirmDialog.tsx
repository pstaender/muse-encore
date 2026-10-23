/*
 * SPDX-License-Identifier: GPL-3.0-only
 */
import { useEffect, useRef } from 'react'
import { qtrc } from '../i18n'

/** a modal question with "Cancel" and a confirm button; onClose(true) if confirmed */
export function ConfirmDialog({ title, message, confirmLabel, onClose }: {
    title: string
    message: string
    confirmLabel: string
    onClose: (confirmed: boolean) => void
}): React.JSX.Element {
    const ref = useRef<HTMLDialogElement>(null)
    useEffect(() => {
        ref.current?.showModal()
    }, [])
    return (
        <dialog ref={ref} className="confirm" aria-labelledby="confirm-title" onClose={() => onClose(ref.current?.returnValue === 'ok')}>
            <h2 id="confirm-title">{title}</h2>
            <p>{message}</p>
            <form method="dialog" className="dialog-buttons">
                <button className="secondary" value="cancel" autoFocus>{qtrc('global', 'Cancel')}</button>
                <button className="primary danger" value="ok">{confirmLabel}</button>
            </form>
        </dialog>
    )
}
