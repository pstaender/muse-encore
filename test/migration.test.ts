// SPDX-License-Identifier: GPL-3.0-only
// The migration of scores of MuseScore 3 and older (ProjectMigrator, MdlMigrator): Leland, Edwin, MDL percussion.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { canUndo, isModified, layoutScore, loadScore, MigrationOptions, MigrationType, scoreAppVersion, scoreMigrationType,
    undo, type MasterScore } from '../src/index'
import { Sid } from '../src/engraving/style/styledef'
import { ROOT, VTEST, hasSubmodule, initFonts, scoreHash } from './helpers'
import type { Note } from '../src/engraving/dom/note'
import type { PointF } from '../src/framework/draw/types/geometry'
import { Pid } from '../src/engraving/dom/property'

const PRE_3_FILE = 'user-offset-1.mscx'

const ALL = MigrationOptions.from({ appVersion: 470, isApplyMigration: true, isAskAgain: false })

async function open(data: string | Uint8Array, migration: MigrationOptions | null): Promise<MasterScore> {
    await initFonts()
    const score = loadScore(typeof data === 'string' ? new TextEncoder().encode(data) : data)
    layoutScore(score, {
        migration,
        templateFile: (name) => readFileSync(`${ROOT}MuseScore/share/templates/${name}`, 'utf8'),
    })
    return score
}

function drumPitches(score: MasterScore): number[] {
    const ds = score.parts()[0].instrument().drumset()!
    return Array.from({ length: 128 }, (_, i) => i).filter(p => ds.isValid(p))
}

function notePitches(score: MasterScore): number[] {
    const pitches: number[] = []
    score.scanElements(e => {
        if (e.isNote()) {
            pitches.push((e as Note).pitch())
        }
    })
    return pitches
}

describe.skipIf(!hasSubmodule)('migration of older scores', () => {
    it('applies Leland and Edwin to a 3.x score, undoably; no migration without options', async () => {
        expect(scoreMigrationType(await open(readFileSync(`${VTEST}/beams-18.mscx`), null))).toBe(MigrationType.Ver_3_6)
        const data = readFileSync(`${VTEST}/layout-10.mscx`)
        const old = await open(data, null)
        expect(scoreMigrationType(old)).toBe(MigrationType.Pre_3_6)
        expect(scoreAppVersion(old)).toMatch(/^3\./)
        expect(old.style().styleSt(Sid.musicalSymbolFont)).toBe('Emmentaler')
        expect(canUndo(old)).toBe(false)
        const oldHash = scoreHash(old)

        const score = await open(data, ALL)
        expect(score.style().styleSt(Sid.musicalSymbolFont)).toBe('Leland')
        expect(score.style().styleSt(Sid.musicalTextFont)).toBe('Leland Text')
        expect(score.style().styleSt(Sid.tupletFontFace)).toBe('Edwin')
        expect(score.metaTag('mscVersion')).toBe('4.70')
        expect(canUndo(score)).toBe(true)
        expect(isModified(score)).toBe(true)
        expect(scoreHash(score)).not.toBe(oldHash)

        expect(undo(score)).toBe(true)
        expect(score.style().styleSt(Sid.musicalSymbolFont)).toBe('Emmentaler')
        expect(score.metaTag('mscVersion')).toBe('')
    })

    it('resets the style settings when neither font is applied', async () => {
        const data = readFileSync(`${VTEST}/layout-10.mscx`)
        const old = await open(data, null)
        const score = await open(data, MigrationOptions.from({ ...ALL, isApplyLeland: false, isApplyEdwin: false }))
        expect(score.style().styleSt(Sid.musicalSymbolFont)).toBe(old.style().styleSt(Sid.musicalSymbolFont))
        expect(score.style().styleD(Sid.dynamicsFontSize)).toBe(10)
        expect(score.style().styleD(Sid.doubleBarDistance)).toBeLessThan(old.style().styleD(Sid.doubleBarDistance))
    })

    it('resets the positions of the elements of scores older than 3.0', async () => {
        const data = readFileSync(`${VTEST}/${PRE_3_FILE}`)
        const userOffsets = (score: MasterScore): number => {
            let n = 0
            score.scanElements(e => {
                if (!e.generated() && !e.offset().equals(e.propertyDefault(Pid.OFFSET) as PointF)) {
                    ++n
                }
            })
            return n
        }
        const old = await open(data, null)
        expect(scoreMigrationType(old)).toBe(MigrationType.Pre_3_6)
        expect(userOffsets(old)).toBeGreaterThan(0)

        const score = await open(data, ALL)
        expect(score.style().styleSt(Sid.musicalSymbolFont)).toBe('Leland')
        expect(userOffsets(score)).toBe(0)
    })

    it('maps MDL percussion to the new notation and sounds (drumset of share/templates)', async () => {
        const xml = readFileSync(`${VTEST}/drumset-custom-1.mscx`, 'utf8')
            .replace('<instrumentId>drum.group.set</instrumentId>', '<instrumentId>mdl.drum.snare-drum</instrumentId>')
            .replace('<program value="0"/>\n          <synti>Fluid</synti>', '<program value="5"/>\n          <synti>Zerberus</synti>')
            .replaceAll('<pitch>37</pitch>', '<pitch>38</pitch>')
        const old = await open(xml, null)
        expect(notePitches(old)).toContain(38)

        const score = await open(xml, ALL)
        // repitchMdlSnares: 38 -> 40
        expect(notePitches(score)).not.toContain(38)
        expect(notePitches(score)).toContain(40)
        // the drumset of Marching_Snare_Drums.drm
        const drm = readFileSync(`${ROOT}MuseScore/share/templates/Marching_Snare_Drums.drm`, 'utf8')
        const drmPitches = [...drm.matchAll(/<Drum pitch="(\d+)"/g)].map(m => Number(m[1]))
        expect(drumPitches(score)).toEqual(drmPitches.sort((a, b) => a - b))

        const noRemap = await open(xml, MigrationOptions.from({ ...ALL, isRemapPercussion: false }))
        expect(notePitches(noRemap)).toContain(38)
        expect(drumPitches(noRemap)).toEqual(drumPitches(old))
    })
})
