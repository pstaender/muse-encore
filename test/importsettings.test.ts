// SPDX-License-Identifier: GPL-3.0-only
// The settings and dialogs of the import (Preferences > Import, IInteractive): the import style, the question about
// MusicXML errors, the warnings of MIDI and Capella files that cannot be read, the MIDI settings shortest note and
// round tempo.
import {
    EngravingErr, importScore, layoutScore, NotationReadError, setImportConfiguration, defaultImportConfiguration,
    type MasterScore, type NotationReaderInteractive,
} from '../src/index'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Sid } from '../src/engraving/style/styledef'
import { ElementType } from '../src/engraving/types/types'
import { SegmentType } from '../src/engraving/dom/segment'
import { ROOT, hasSubmodule, initFonts } from './helpers'

const IMPORT = `${ROOT}MuseScore/src/importexport/`

/** records the dialogs; the questions are answered with `answer` */
function recorder(answer = true): NotationReaderInteractive & { asked: string[] } {
    const asked: string[] = []
    return {
        asked,
        question: async (title) => { asked.push(title); return answer },
        warning: async (title, text) => { asked.push(`${title}: ${text}`) },
    }
}

async function readError(p: Promise<unknown>): Promise<NotationReadError> {
    try {
        await p
    } catch (e) {
        if (e instanceof NotationReadError) {
            return e
        }
        throw e
    }
    throw new Error('no error')
}

/** the chords of the score */
function countChords(score: MasterScore): number {
    let n = 0
    for (let seg = score.firstSegment(SegmentType.ChordRest); seg; seg = seg.next1(SegmentType.ChordRest)) {
        n += seg.elist().filter(e => e?.type() === ElementType.CHORD).length
    }
    return n
}

describe.skipIf(!hasSubmodule)('import settings and dialogs', () => {
    beforeAll(initFonts)
    afterEach(() => setImportConfiguration(defaultImportConfiguration()))

    it('asks whether to load a MusicXML file with errors anyway', async () => {
        const xml = readFileSync(`${IMPORT}musicxml/tests/data/testHello.xml`, 'utf8')
        const truncated = new TextEncoder().encode(xml.slice(0, xml.indexOf('</measure>')))
        const yes = recorder(true)
        const score = await importScore(truncated, 'hello.xml', { interactive: yes })
        expect(yes.asked).toHaveLength(1)
        expect(yes.asked[0]).toMatch(/error\(s\) found, import may be incomplete\./)
        expect(countChords(score)).toBe(1)

        const no = recorder(false)
        const e = await readError(importScore(truncated, 'hello.xml', { interactive: no }))
        expect(e.code).toBe(EngravingErr.UserAbort)
        // without dialogs (MScore::noGui) the import goes on
        await importScore(truncated, 'hello.xml')
        // a file without errors: no question
        const ok = recorder()
        await importScore(new TextEncoder().encode(xml), 'hello.xml', { interactive: ok })
        expect(ok.asked).toEqual([])
    })

    it('warns about MIDI and Capella files that cannot be read', async () => {
        const midi = recorder()
        const e = await readError(importScore(new TextEncoder().encode('MThd garbage'), 'bad.mid', { interactive: midi }))
        expect(e.code).toBe(EngravingErr.FileBadFormat)
        expect(midi.asked).toHaveLength(1)
        expect(midi.asked[0]).toMatch(/^Import MIDI: Import failed: /)

        const cap = recorder()
        const c = await readError(importScore(readFileSync(`${IMPORT}capella/tests/data/test1-corrupt-string-length.cap`), 'bad.cap', { interactive: cap }))
        expect(cap.asked).toEqual(['Import Capella: Import failed: bad file content'])
        expect(c.code).toBe(EngravingErr.IgnoreError) // the message was shown
    })

    it('applies the style for imports', async () => {
        const data = readFileSync(`${IMPORT}musicxml/tests/data/testHello.xml`)
        const plain = await importScore(data, 'hello.xml')
        expect(plain.style().value(Sid.measureSpacing)).toBe(1.5)
        const style = '<?xml version="1.0" encoding="UTF-8"?>\n<museScore version="4.70"><Style><measureSpacing>1.8</measureSpacing></Style></museScore>\n'
        const styled = await importScore(data, 'hello.xml', { style })
        expect(styled.style().value(Sid.measureSpacing)).toBe(1.8)
    })

    it('quantizes MIDI files with the shortest note and rounds tempos', async () => {
        const eighths = readFileSync(`${IMPORT}midi/tests/midiimport_data/simplify_8th_dont.mid`)
        const fine = await importScore(eighths, 'eighths.mid') // 16th
        setImportConfiguration({ midi: { midiShortestNote: 480 } }) // quarter
        const coarse = await importScore(eighths, 'eighths.mid')
        expect(countChords(coarse)).toBeLessThan(countChords(fine))

        const data = readFileSync(`${IMPORT}midi/tests/midiimport_data/human_tempo.mid`)

        const tempos = (s: MasterScore): number[] => {
            layoutScore(s) // sets up the tempo map
            return s.tempomap().values().map(t => t.tempo * 60)
        }
        setImportConfiguration({ midi: { roundTempo: false } })
        const exact = tempos(await importScore(data, 'human.mid'))
        setImportConfiguration({ midi: { roundTempo: true } })
        const rounded = tempos(await importScore(data, 'human.mid'))
        expect(rounded.every(t => Math.abs(t - Math.round(t)) < 1e-6)).toBe(true)
        expect(exact.some(t => Math.abs(t - Math.round(t)) > 1e-6)).toBe(true)
    })
})
