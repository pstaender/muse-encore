/*
 * SPDX-License-Identifier: GPL-3.0-only
 * About (after MuseScore's AboutDialog.qml): MuseEncore is a port of MuseScore Studio, so it says which version it
 * follows and links to MuseScore; it is neither an official MuseScore project nor an official fork.
 */
import { useEffect, useRef } from 'react'
import { version } from '../../package.json'
import logoUrl from '../../logo/muse-encore-logo.svg'
import { arg, qtrc, useLanguage, webtr } from '../i18n'

const REFERENCE_VERSION = '4.7.5'
const REFERENCE_REVISION = '3654226'

export function AboutDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
    useLanguage()
    const ref = useRef<HTMLDialogElement>(null)
    useEffect(() => {
        ref.current?.showModal()
    }, [])
    return (
        <dialog ref={ref} className="about" aria-labelledby="about-title" onClose={onClose}>
            <div className="about-header">
                <img src={logoUrl} alt="" width={64} height={64} />
                <div>
                    <h2 id="about-title">MuseEncore</h2>
                    <p>{qtrc('appshell/about', 'Version:')} {version}</p>
                </div>
            </div>
            <p>
                A port of <a href="https://musescore.org" target="_blank" rel="noopener">MuseScore Studio</a> to the web.
                {' '}{webtr('Based on:')} MuseScore Studio {REFERENCE_VERSION}
                {' '}({qtrc('appshell/about', 'Revision:')} {REFERENCE_REVISION})
            </p>
            <p>MuseEncore is neither an official MuseScore project nor an official fork of MuseScore.</p>
            <p>{arg(qtrc('appshell/about', 'Visit %1 for new versions and more information.'), 'github.com/pstaender/muse-encore')}
                {' '}<a href="https://github.com/pstaender/muse-encore" target="_blank" rel="noopener">github.com/pstaender/muse-encore</a></p>
            <p className="muted">
                Copyright © 2026 Philipp Staender and contributors. Based on MuseScore Studio, copyright © 1999-2026
                MuseScore Limited and others. GNU General Public License version 3.
            </p>
            <form method="dialog" className="dialog-buttons">
                <button className="primary" value="ok" autoFocus>{qtrc('global', 'OK')}</button>
            </form>
        </dialog>
    )
}
