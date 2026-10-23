/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The New Score dialog (MuseScore's NewScoreDialog.qml): first page "Choose instruments" or "Create from template",
 * second page "Additional score information" (key, time signature, tempo, measures, title, ...).
 */
import { useEffect, useRef, useState } from 'react'
import { defaultNewScoreOptions, type NewScoreOptions } from '../../src/index'
import { qtrc, useLanguage } from '../i18n'
import { createNewScore, showNewScoreDialog } from '../session'
import { updateSettings, useSettings } from '../settings'
import { loadTemplate, type TemplateInfo } from '../templates'
import { ChooseInstrumentsPage } from './ChooseInstrumentsPage'
import { CreateFromTemplatePage } from './CreateFromTemplatePage'
import { orderList, type OrderChoice, type ScoreInstrument } from './instrumentmodels'
import { ScoreInfoPage, type ScoreInfo } from './ScoreInfoPage'

export function NewScoreDialog(): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const { newScore } = useSettings()
    const [mode, setMode] = useState(newScore.mode)
    const [page, setPage] = useState<'choose' | 'info'>('choose')
    const [instruments, setInstruments] = useState<ScoreInstrument[]>([])
    const [order, setOrder] = useState<OrderChoice>(() => ({ id: orderList()[0].id, customized: false }))
    const [template, setTemplate] = useState<TemplateInfo | null>(null)
    const [info, setInfo] = useState<ScoreInfo>(() => {
        const { instruments: _i, order: _o, orderCustomized: _c, templateMscx: _t, templateStyle: _s, ...rest } = defaultNewScoreOptions()
        return rest
    })
    const [creating, setCreating] = useState(false)

    useEffect(() => {
        ref.current?.showModal()
    }, [])

    const canCreate = mode === 'instruments' ? instruments.length > 0 : !!template

    const done = async (): Promise<void> => {
        if (!canCreate || creating) {
            return
        }
        setCreating(true)
        try {
            const options: NewScoreOptions = mode === 'instruments'
                ? { ...info, instruments: instruments.map(i => ({ id: i.id, soloist: i.soloist })), order: order.id, orderCustomized: order.customized }
                : await loadTemplate(template!.path).then(t => ({ ...info, instruments: [], templateMscx: t.mscx, templateStyle: t.style ?? undefined }))
            // NewScoreModel::updatePreferredScoreCreationMode
            updateSettings('newScore', { mode })
            ref.current?.close()
            await createNewScore(options)
        } finally {
            setCreating(false)
        }
    }

    return (
        <dialog ref={ref} className="new-score" aria-labelledby="new-score-title"
            onClose={() => showNewScoreDialog(false)}
            onKeyDown={(e) => {
                // Enter in a text field finishes the dialog (not in lists, where it adds the instrument)
                if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type === 'text') {
                    e.preventDefault()
                    void done()
                }
            }}>
            <header className="dialog-header">
                <h2 id="new-score-title">{qtrc('project', 'New score')}</h2>
                <button className="icon" aria-label={qtrc('global', 'Close')} title={qtrc('global', 'Close')} onClick={() => ref.current?.close()}>{''}</button>
            </header>

            {page === 'choose' ? (
                <>
                    <div className="dialog-tabs" role="tablist" >
                        <button role="tab" id="tab-instruments" aria-selected={mode === 'instruments'} aria-controls="page-choose"
                            onClick={() => setMode('instruments')}>{qtrc('project/newscore', 'Choose instruments')}</button>
                        <button role="tab" id="tab-template" aria-selected={mode === 'template'} aria-controls="page-choose"
                            onClick={() => setMode('template')}>{qtrc('project/newscore', 'Create from template')}</button>
                    </div>
                    <div className="dialog-page" id="page-choose" role="tabpanel"
                        aria-labelledby={mode === 'instruments' ? 'tab-instruments' : 'tab-template'}>
                        {mode === 'instruments'
                            ? <ChooseInstrumentsPage instruments={instruments} setInstruments={setInstruments} order={order} setOrder={setOrder} />
                            : <CreateFromTemplatePage template={template} setTemplate={setTemplate} />}
                    </div>
                </>
            ) : (
                <div className="dialog-page">
                    <ScoreInfoPage info={info} setInfo={setInfo} />
                </div>
            )}

            <footer className="dialog-buttons">
                <button className="secondary" onClick={() => ref.current?.close()}>{qtrc('global', 'Cancel')}</button>
                {page === 'info'
                    ? <button className="secondary" onClick={() => setPage('choose')}>{qtrc('global', 'Back')}</button>
                    : <button className="secondary" disabled={!canCreate} onClick={() => setPage('info')}>{qtrc('global', 'Next')}</button>}
                <button className="primary" disabled={!canCreate || creating} onClick={() => void done()}>{qtrc('global', 'Done')}</button>
            </footer>
        </dialog>
    )
}
