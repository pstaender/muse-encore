/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The question about the migration of a score of MuseScore 3 and older (MuseScore's MigrationDialog.qml with
 * MigrationContentForPre362.qml / MigrationContentFor362.qml): the new fonts Leland and Edwin, the new mapping of MDL
 * percussion. Answered with the chosen options (OK) or null (closed: the score is not opened).
 */
import { Fragment, useEffect, useRef, useState } from 'react'
import { MigrationType } from '../../src/index'
import { arg, qtrc, useLanguage } from '../i18n'
import type { MigrationQuestion } from '../session'
import type { StoredMigrationOptions } from '../settings'
import migrationImage from '../../MuseScore/src/project/qml/MuseScore/Project/internal/Migration/migration.png'

const MDL_URL = 'https://musescore.org/node/367337' // non-'/en' URL should redirect to translated version, if available
const VIDEO_URL = 'https://youtu.be/U7dagae87eM'

/** a text of MuseScore's translations with <a href="..."> links (StyledTextLabel's rich text) */
function richText(text: string): React.ReactNode {
    const parts = text.split(/<a href="([^"]*)">(.*?)<\/a>/)
    return parts.map((part, i) => {
        if (i % 3 === 0) {
            return <Fragment key={i}>{part}</Fragment>
        }
        if (i % 3 === 1) {
            const href = part
            return /^https?:\/\//.test(href)
                ? <a key={i} href={href} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}>{parts[i + 1]}</a>
                : <Fragment key={i}>{parts[i + 1]}</Fragment>
        }
        return null
    })
}

export function MigrationDialog({ question, onClose }: {
    question: MigrationQuestion
    onClose: (answer: StoredMigrationOptions | null) => void
}): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    const okRef = useRef<HTMLButtonElement>(null)
    const pre362 = question.migrationType === MigrationType.Pre_3_6
    const [options, setOptions] = useState<StoredMigrationOptions>(() => ({
        ...question.options,
        // onOpened: the fonts of 3.6 are already Leland and Edwin
        ...(pre362 ? {} : { isApplyLeland: false, isApplyEdwin: false }),
    }))
    useEffect(() => {
        ref.current?.showModal()
        okRef.current?.focus() // showModal() focuses the first checkbox
    }, [])

    const set = (patch: Partial<StoredMigrationOptions>): void => setOptions(o => ({ ...o, ...patch }))
    const title = arg(qtrc('project/migration', 'This file was last saved in MuseScore %1'), question.appVersion)
    const watchVideo = (label: string): React.JSX.Element => (
        <button type="button" className="secondary" onClick={() => window.open(VIDEO_URL, '_blank', 'noopener')}>{label}</button>
    )
    const percussion = (text: string): React.JSX.Element => (
        <label className="check">
            <input type="checkbox" checked={options.isRemapPercussion} onChange={e => set({ isRemapPercussion: e.target.checked })} />
            <span>{richText(arg(qtrc('project/migration', text), MDL_URL))}</span>
        </label>
    )

    return (
        <dialog ref={ref} className={`migration${pre362 ? ' pre362' : ''}`} aria-labelledby="migration-title"
            onClose={() => onClose(ref.current?.returnValue === 'ok'
                // makeRet(true): the chosen options (appVersion: Constants::MSC_VERSION)
                ? { ...options, appVersion: 470, isApplyMigration: true }
                : null)}>
            {pre362 ? (
                <div className="migration-content">
                    <div>
                        <h2 id="migration-title">{title}</h2>
                        <p>{qtrc('project/migration', 'Select the engraving improvements you would like to apply to your score')}</p>
                    </div>
                    <div className="migration-image">
                        <img src={migrationImage} alt="" />
                    </div>
                    <div className="migration-options">
                        <label className="check">
                            <input type="checkbox" checked={options.isApplyLeland} onChange={e => set({ isApplyLeland: e.target.checked })} />
                            {qtrc('project/migration', 'Our new notation font, Leland')}
                        </label>
                        <label className="check">
                            <input type="checkbox" checked={options.isApplyEdwin} onChange={e => set({ isApplyEdwin: e.target.checked })} />
                            {qtrc('project/migration', 'Our new text font, Edwin')}
                        </label>
                        {percussion('Our new notation and sound mapping for <a href="%1">MDL percussion</a>')}
                    </div>
                    <div className="migration-info">
                        <p>{qtrc('project/migration', 'Please note: score layouts will be affected by improvements to MuseScore Studio')}</p>
                        {watchVideo(qtrc('project/migration', 'Watch video'))}
                    </div>
                </div>
            ) : (
                <div className="migration-content">
                    <h2 id="migration-title">{title}</h2>
                    <p>{qtrc('project/migration', 'Please note that the appearance of your score will change due to improvements we have made to default settings for beaming, ties, slurs, system objects and horizontal spacing.')}</p>
                    {percussion('Use our new notation and sound mapping for <a href="%1">MDL percussion</a>')}
                    <div>{watchVideo(qtrc('project/migration', 'Watch video about changes'))}</div>
                </div>
            )}
            <form method="dialog" className="migration-footer">
                <label className="check">
                    <input type="checkbox" checked={!options.isAskAgain} onChange={e => set({ isAskAgain: !e.target.checked })} />
                    {qtrc('global', 'Don’t ask again')}
                </label>
                <button ref={okRef} className="primary" value="ok">{qtrc('global', 'OK')}</button>
            </form>
        </dialog>
    )
}
