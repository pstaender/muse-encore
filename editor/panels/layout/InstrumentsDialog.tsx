/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The instruments dialog of the "instruments" action (MuseScore's InstrumentsDialog.qml, opened by the Layout panel's
 * Add > New instrument): the Choose instruments page of the New Score dialog.
 * TODO(port): MuseScore lists the score's instruments too (add and remove in one dialog); here only the new ones are
 * chosen and appended (editbridge.addInstruments).
 */
import { useEffect, useRef, useState } from 'react'
import { qtrc } from '../../i18n'
import { ChooseInstrumentsPage } from '../../newscore/ChooseInstrumentsPage'
import { orderList, type OrderChoice, type ScoreInstrument } from '../../newscore/instrumentmodels'
import { ICON_CODES } from '../../actions/uiactiondata'

export function InstrumentsDialog({ onClose }: { onClose: (instrumentIds: string[] | null) => void }): React.JSX.Element {
    const ref = useRef<HTMLDialogElement>(null)
    const [instruments, setInstruments] = useState<ScoreInstrument[]>([])
    const [order, setOrder] = useState<OrderChoice>(() => ({ id: orderList()[0].id, customized: false }))
    const result = useRef<string[] | null>(null)

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    return (
        <dialog ref={ref} className="new-score instruments-dialog" aria-labelledby="instruments-dialog-title"
            onClose={() => onClose(result.current)}>
            <header className="dialog-header">
                <h2 id="instruments-dialog-title">{qtrc('instruments', 'Add or remove instruments')}</h2>
                <button className="icon" aria-label={qtrc('global', 'Close')} title={qtrc('global', 'Close')} onClick={() => ref.current?.close()}>{String.fromCodePoint(ICON_CODES.CLOSE_X_ROUNDED)}</button>
            </header>
            <div className="dialog-page">
                <ChooseInstrumentsPage instruments={instruments} setInstruments={setInstruments} order={order} setOrder={setOrder} />
            </div>
            <footer className="dialog-buttons">
                <button className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                <button className="primary" disabled={!instruments.length} onClick={() => {
                    result.current = instruments.map(i => i.id)
                    ref.current?.close()
                }}>{qtrc('global', 'OK')}</button>
            </footer>
        </dialog>
    )
}
