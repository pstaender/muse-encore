/*
 * SPDX-License-Identifier: GPL-3.0-only
 * About (after MuseScore's AboutDialog.qml): this is a port of MuseScore Studio, so it says which version it
 * follows and links to MuseScore.
 */
import { useEffect, useRef } from 'react'
import { arg, qtrc, useLanguage } from '../i18n'

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
            <h2 id="about-title">MuseScore Web</h2>
            <p>
                A port of MuseScore Studio to the web. {qtrc('appshell/about', 'Version:')} MuseScore Studio {REFERENCE_VERSION}
                {' '}({qtrc('appshell/about', 'Revision:')} {REFERENCE_REVISION})
            </p>
            <p>{arg(qtrc('appshell/about', 'Visit %1 for new versions and more information.'), 'musescore.org')}
                {' '}<a href="https://musescore.org" target="_blank" rel="noopener">musescore.org</a></p>
            <p className="muted">
                Copyright © 1999-2026 MuseScore Limited and others. GNU General Public License version 3.
            </p>
            <form method="dialog" className="dialog-buttons">
                <button className="primary" value="ok" autoFocus>{qtrc('global', 'OK')}</button>
            </form>
        </dialog>
    )
}
