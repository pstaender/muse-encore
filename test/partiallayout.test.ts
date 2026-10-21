// SPDX-License-Identifier: GPL-3.0-only
// The layout of the changed range after a command (ScorePageViewLayout::initLayoutContext for !isLayoutAll) gives the
// same result as a layout of the whole score: the same commands are applied to two instances of a score, one laid out
// partially (Score.partialLayout), the other one completely after every command.
// (Comparing the partial layout with a second full layout of the same instance is not the same: like in C++, the
// layout is not always idempotent, e.g. Note::updateAccidental depends on accidentals added earlier in the same pass,
// and a trill cue note is only laid out once Chord::startingSpanners is up to date.)
import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// first: the library's import order (the DOM modules have import cycles)
import { TEST_FILES, VTEST, hasSubmodule, openScore } from './helpers'
import { drawPageSvg } from '../src/index'
import { Score } from '../src/engraving/dom/score'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import { UpDownMode } from '../src/engraving/dom/mscore'
import { AccidentalType } from '../src/engraving/dom/accidentaldata'
import { TDuration } from '../src/engraving/dom/durationtype'
import { DurationType } from '../src/engraving/types/types'
import type { MasterScore } from '../src/engraving/dom/masterscore'
import type { Chord } from '../src/engraving/dom/chord'
import type { ChordRest } from '../src/engraving/dom/chordrest'

function chordRests(score: MasterScore): ChordRest[] {
    const res: ChordRest[] = []
    for (let s = score.firstMeasure()?.first(SegmentType.ChordRest) ?? null; s; s = s.next1(SegmentType.ChordRest)) {
        for (let track = 0; track < score.ntracks(); ++track) {
            const e = s.element(track)
            if (e && e.isChordRest()) {
                res.push(e as unknown as ChordRest)
            }
        }
    }
    return res
}

/**
 * A hash of the SVG of all pages that does not depend on the drawing order: items with the same z value have no
 * defined order (C++ paints them sorted with the unstable std::sort; the order of the spanner segments of a system
 * depends on the order in which they were laid out, which is not the same in a partial and in a full layout).
 */
function layoutHash(score: MasterScore): string {
    const h = createHash('sha256')
    for (let i = 0; i < score.npages(); ++i) {
        h.update(drawPageSvg(score, i, { printing: true }).split('><').sort().join('>\n<'))
    }
    return h.digest('hex')
}

type Edit = [string, (score: MasterScore, cr: ChordRest) => void]

const EDITS: Edit[] = [
    ['pitch up', (score) => score.upDown(true, UpDownMode.CHROMATIC)],
    ['octave down', (score) => score.upDown(false, UpDownMode.OCTAVE)],
    ['sharp', (score) => score.changeAccidental(AccidentalType.SHARP)],
    ['visible', (score) => score.cmdToggleVisible()],
    ['flip', (score) => score.cmdFlip()],
    ['eighth', (score, cr) => score.changeCRlen(cr, new TDuration(DurationType.V_EIGHTH))],
    ['half', (score, cr) => score.changeCRlen(cr, new TDuration(DurationType.V_HALF))],
    ['delete', (score) => score.cmdDeleteSelection()],
]

/**
 * Edits (file name: edit names, or all edits) whose partial layout differs from the full layout in C++ as well (same
 * code paths); they are not applied.
 */
const KNOWN_EXCEPTIONS: Record<string, string[] | 'all'> = {
    // The range ends with the system before the edit's next system: SystemLayout::collectSystem restores the header of
    // the next system's first measure (addSystemHeader in the "rangeDone" branch) after setRepeatCourtesiesAndParens
    // -> removeRepeatCourtesies has reset hasCourtesyKeySig of the previous measure, and the system trailer that sets it
    // again comes later, so the header key signature shows naturals that the full layout does not show.
    'layout-6.mscx': 'all',
    // The repeat courtesy key signature parentheses of the measure after the range keep the layout data of the
    // previous layout (PassResetLayoutData only resets the measures of the range, the full layout resets everything),
    // so the segment shape is wider when the measure is tried for the system and the system breaks differently.
    'courtesyKeysigParens.mscz': ['half'],
    // A big time signature (timeSigPlacement ACROSS_STAVES) at the start of the system after the range: the "rangeDone"
    // restore of that measure lays out the time signature again (MeasureLayout::layoutMeasureElements) but does not
    // autoplace it again (SystemLayout::layoutParenthesisAndBigTimeSigs is only called for collected systems).
    'bigTimeSig-1.mscz': 'all',
    'bigTimeSig-2.mscz': 'all',
}

function withLayoutMode<T>(partial: boolean, f: () => T): T {
    Score.partialLayout = partial
    try {
        return f()
    } finally {
        Score.partialLayout = true
    }
}

/**
 * Applies the edits (each one followed by its undo) to the chord/rests picked from the list of all chord/rests (indices
 * for its length) of both instances and compares them after every command.
 */
async function checkEdits(file: string, picks: (n: number) => number[], edits: Edit[], onLoadError?: () => void): Promise<void> {
    let partial: MasterScore
    let full: MasterScore
    try {
        partial = await openScore(file)
        full = await openScore(file)
    } catch (e) {
        if (!onLoadError) {
            throw e
        }
        onLoadError()
        return
    }
    const exceptions = KNOWN_EXCEPTIONS[file.split('/').pop()!] ?? []
    const crsP = chordRests(partial)
    const crsF = chordRests(full)
    const indices = [...new Set(picks(crsP.length).map((i) => Math.floor(i)))].filter((i) => i >= 0 && i < crsP.length)
    for (const i of indices) {
        const crP = crsP[i]
        const crF = crsF[i]
        for (const [name, edit] of edits) {
            if (!crP.explicitParent() || exceptions === 'all' || exceptions.includes(name)) {
                continue
            }
            const at = `${name} at tick ${crP.tick().ticks()} (track ${crP.track()})`
            for (const [score, cr, isPartial] of [[partial, crP, true], [full, crF, false]] as const) {
                withLayoutMode(isPartial, () => {
                    score.deselectAll()
                    score.select(cr.isChord() ? (cr as Chord).upNote() : cr, SelectType.SINGLE)
                    score.startCmd()
                    edit(score, cr)
                    score.endCmd()
                })
            }
            expect(layoutHash(partial), at).toBe(layoutHash(full))
            withLayoutMode(true, () => partial.undoRedo(true))
            withLayoutMode(false, () => full.undoRedo(true))
            expect(layoutHash(partial), `undo ${at}`).toBe(layoutHash(full))
        }
    }
}

/** a deterministic selection of about `count` vtest scores (every n-th file in alphabetical order) */
function vtestSelection(count: number): string[] {
    const files = readdirSync(VTEST).filter((f) => /\.msc[zx]$/.test(f)).sort()
    const step = Math.max(1, Math.floor(files.length / count))
    return files.filter((_, i) => i % step === 0).slice(0, count)
}

describe.runIf(hasSubmodule)('partial layout', () => {
    const files = [
        `${TEST_FILES}/Chopin_-_Nocturne_Op_9_No_2_E_Flat_Major.mscz`, `${VTEST}/beams-1.mscz`, `${VTEST}/accidental-1.mscx`,
        `${VTEST}/ornament-7.mscz`, `${VTEST}/tie-9.mscz`, `${VTEST}/lyrics-14.mscz`,
    ]
    for (const file of files) {
        it(`equals the full layout after edits: ${file.split('/').pop()}`, async () => {
            // chords in the middle and near the end of the score, and the 4th chord/rest
            await checkEdits(file, (n) => [n / 2, n * 0.8, 3], EDITS)
        }, 120000)
    }
})

/**
 * Many vtest scores with fewer edits (one chord/rest in the middle of the score) to keep the runtime acceptable.
 * PL_COUNT=900 PL_ALL_EDITS=1 checks all vtest scores with all edits (several minutes; run it in slices with
 * PL_SLICE=from,to if the worker runs out of memory).
 */
const LARGE_SET_EDITS = process.env.PL_ALL_EDITS ? EDITS : EDITS.filter(([name]) => ['pitch up', 'half', 'delete'].includes(name))

describe.runIf(hasSubmodule)('partial layout of many vtest scores', () => {
    const slice = (process.env.PL_SLICE ?? '0').split(',').map(Number)
    for (const f of vtestSelection(Number(process.env.PL_COUNT ?? 150)).slice(...slice)) {
        it(`equals the full layout after edits: ${f}`, async (ctx) => {
            // scores the port cannot load are skipped
            await checkEdits(`${VTEST}/${f}`, (n) => [n / 2], LARGE_SET_EDITS, () => ctx.skip())
        }, 120000)
    }
})
