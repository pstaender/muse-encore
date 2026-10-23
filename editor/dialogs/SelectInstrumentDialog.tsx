/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's InstrumentsDialog with canSelectMultipleInstruments = false ("Select instrument": the families and the
 * instruments; SelectInstrumentsScenario::selectInstrument): for instrument changes (added from the palette or
 * Add > Text, "Select instrument…" of an instrument change) and the Layout panel's "Replace instrument".
 * askInstrument() opens it and resolves with the chosen instrument template id, or null if it was cancelled.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { qtrc } from '../i18n'
import { ChooseInstrumentsPage } from '../newscore/ChooseInstrumentsPage'
import { orderList, type OrderChoice, type ScoreInstrument } from '../newscore/instrumentmodels'

interface Request {
    key: number
    resolve: (templateId: string | null) => void
}

let s_request: Request | null = null
let s_key = 0
const listeners = new Set<() => void>()

function setRequest(r: Request | null): void {
    s_request = r
    for (const l of listeners) {
        l()
    }
}

/** opens the dialog; resolves with the chosen instrument template id or null */
export function askInstrument(): Promise<string | null> {
    s_request?.resolve(null)
    return new Promise(resolve => setRequest({ key: ++s_key, resolve }))
}

function SelectInstrumentDialog({ request }: { request: Request }): React.JSX.Element {
    const ref = useRef<HTMLDialogElement>(null)
    const [instruments, setInstruments] = useState<ScoreInstrument[]>([])
    const [order, setOrder] = useState<OrderChoice>(() => ({ id: orderList()[0].id, customized: false }))
    const [selected, setSelected] = useState<string | null>(null)
    const result = useRef<string | null>(null)

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    const accept = (id: string | null): void => {
        if (id) {
            result.current = id
            ref.current?.close()
        }
    }

    return (
        <dialog ref={ref} className="new-score instruments-dialog select-instrument" aria-labelledby="select-instrument-title"
            onClose={() => {
                setRequest(null)
                request.resolve(result.current)
            }}>
            <header className="dialog-header">
                <h2 id="select-instrument-title">{qtrc('instruments', 'Select instrument')}</h2>
                <button className="icon" aria-label={qtrc('global', 'Close')} title={qtrc('global', 'Close')} onClick={() => ref.current?.close()}>{''}</button>
            </header>
            <div className="dialog-page">
                <ChooseInstrumentsPage instruments={instruments} setInstruments={setInstruments} order={order} setOrder={setOrder}
                    single={{ onSelect: setSelected, onAccept: accept }} />
            </div>
            <footer className="dialog-buttons">
                <button className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                <button className="primary" disabled={!selected} onClick={() => accept(selected)}>{qtrc('global', 'OK')}</button>
            </footer>
        </dialog>
    )
}

/** renders the dialog while askInstrument() waits */
export function SelectInstrumentHost(): React.JSX.Element | null {
    const request = useSyncExternalStore(listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }, () => s_request)
    return request ? <SelectInstrumentDialog key={request.key} request={request} /> : null
}
