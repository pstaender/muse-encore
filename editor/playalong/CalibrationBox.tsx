/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The guide of the note detection's calibration (not in MuseScore): a box over the calibration sheet that says what to
 * play in the highlighted measure; at the end the values measured can be taken.
 */
import React from 'react'
import { arg, qtrc, useLanguage, webtr } from '../i18n'
import type { CalibrationKind } from '../../shared/notedetection/calibration'
import { finishCalibration, repeatCalibration, skipCalibrationStep, usePlayalongState } from './playalongcontroller'

function stepText(kind: CalibrationKind): string {
    switch (kind) {
    case 'silence':
        return webtr('Please be quiet for a few seconds.')
    case 'loud':
        return webtr('Play the highlighted note loudly and let it sound.')
    case 'octave':
        return webtr('Play the highlighted octave and let it sound.')
    case 'soft':
        return webtr('Play the highlighted note softly.')
    }
}

export function CalibrationBox(): React.JSX.Element | null {
    useLanguage()
    const st = usePlayalongState()
    const c = st.calibration
    if (!st.active || st.mode !== 'calibration' || !c) {
        return null
    }
    const title = webtr('Calibrate the note detection')
    let body: React.ReactNode
    let buttons: React.ReactNode
    if (st.status === 'loading') {
        body = <p>{webtr('Starting the note detection…')}</p>
        buttons = <button className="secondary" onClick={() => finishCalibration(false)}>{qtrc('global', 'Cancel')}</button>
    } else if (c.result) {
        body = (
            <>
                <p>{arg(webtr('Done: %1 of %2 steps were recognized.'), String(c.result.recognized), String(c.result.steps))}</p>
                <p>{webtr('Use the measured values for the note detection? The overtone filter is then set to “Calibrated”.')}</p>
            </>
        )
        buttons = (
            <>
                <button className="secondary" onClick={repeatCalibration}>{webtr('Repeat')}</button>
                <button className="secondary" onClick={() => finishCalibration(false)}>{qtrc('global', 'Cancel')}</button>
                <button className="primary" onClick={() => finishCalibration(true)} autoFocus>{webtr('Use these values')}</button>
            </>
        )
    } else {
        body = (
            <>
                <p className="calibration-progress">{arg(webtr('Step %1 of %2'), String(c.step + 1), String(c.steps))}</p>
                <p>{c.kind && stepText(c.kind)}</p>
            </>
        )
        buttons = (
            <>
                <button className="secondary" onClick={() => finishCalibration(false)}>{qtrc('global', 'Cancel')}</button>
                {c.kind !== 'silence' && <button className="secondary" onClick={skipCalibrationStep}>{qtrc('project/export', 'Skip')}</button>}
            </>
        )
    }
    return (
        <div className="calibration-box" role="dialog" aria-modal="false" aria-label={title}>
            <h3>{title}</h3>
            <div aria-live="polite">{body}</div>
            <div className="calibration-buttons">{buttons}</div>
        </div>
    )
}
