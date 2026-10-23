/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Commands that need MuseScore's "Select instrument" dialog while they run (NotationInteraction::selectInstrument:
 * adding an instrument change). MuseScore opens the dialog in the middle of the command; a page can't wait for it, so
 * the dialog is opened first and the command then gets the chosen instrument from the library's select instrument
 * provider. Cancelling the dialog runs nothing (MuseScore: rollback).
 */
import { setSelectInstrumentProvider } from '../../src/index'
import { askInstrument } from './SelectInstrumentDialog'

/** opens the dialog and runs the command with the chosen instrument; false if it was cancelled */
export async function withSelectedInstrument(run: () => void): Promise<boolean> {
    const templateId = await askInstrument()
    if (!templateId) {
        return false
    }
    setSelectInstrumentProvider(() => templateId)
    try {
        run()
    } finally {
        setSelectInstrumentProvider(null)
    }
    return true
}

/** the mime data (mimeSymbolFormat) of a dragged element is an instrument change */
export function isInstrumentChangeSymbol(symbol: string): boolean {
    return /<InstrumentChange[\s>/]/.test(symbol)
}
