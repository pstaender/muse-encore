/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Puente mínimo con Chorus: exporta la partitura actual a .mxl cuando el contenedor lo
 * pide y devuelve el binario por postMessage. No conoce tokens ni URLs de Chorus.
 */
import { createExportDialogModel } from '../src/index'
import { baseName } from './files'
import { currentScore } from './scoreview'
import { session } from './session'
import { settings } from './settings'

function post(type: string, payload: Record<string, unknown> = {}): void {
    window.parent.postMessage({ type, ...payload }, '*')
}

async function exportMxl(): Promise<void> {
    const score = currentScore()
    if (!score) {
        post('chorus:error', { message: 'No hay una partitura abierta' })
        return
    }
    try {
        const configuration = structuredClone(settings().export)
        const model = createExportDialogModel(
            score,
            configuration,
            baseName(session().current?.name ?? 'partitura'),
            () => {},
        )
        model.init()
        model.selectExportTypeById('mxl')
        const files = await model.exportScores()
        const file = files.find(item => item.fileName.toLowerCase().endsWith('.mxl')) ?? files[0]
        if (!file) {
            throw new Error('No se pudo exportar la partitura')
        }
        post('chorus:score', { fileName: file.fileName, data: file.data })
    } catch (error) {
        post('chorus:error', {
            message: error instanceof Error ? error.message : 'No se pudo exportar la partitura',
        })
    }
}

window.addEventListener('message', (event: MessageEvent) => {
    const type = (event.data as { type?: string } | null)?.type
    if (type === 'chorus:request-export') {
        void exportMxl()
    } else if (type === 'chorus:ping') {
        post('chorus:ready')
    }
})

post('chorus:ready')
