// SPDX-License-Identifier: GPL-3.0-only
// The part and staff commands of the Layout panel / instruments dialog (NotationParts, EditPart, Score's
// insertStaff/removeStaff/sortStaves ...): each command changes the score, undo restores it exactly (SVG hash of all
// pages), redo restores the changed state.
import { beforeAll, describe, expect, it } from 'vitest'
import {
    addInstruments, replacePartInstrument, addSystemObjects, appendStaff, createScore, defaultNewScoreOptions, moveParts, moveStaves,
    moveSystemObjectLayerBottomStaff, moveSystemObjects, removeParts, removeStaves, removeSystemObjects, setInstruments,
    setPartVisible, setScoreOrder, setStaffVisible, undo, redo, layoutPanelScoreOrder, layoutScore, saveMscz, type MasterScore,
} from '../src/index'
import { DEMOS, VTEST, hasSubmodule, initFonts, openScore, scoreHash } from './helpers'

function partNames(score: MasterScore): string[] {
    return score.parts().map(p => `${p.partName()}:${p.nstaves()}`)
}

/**
 * applies the command, checks that it changed the score, undo restores it and redo repeats it; leaves it undone.
 * relayout: the hashes are taken after one more layout of the whole score. Like in MuseScore, some layout results
 * (e.g. cross-staff beams) depend on the previous layout, which is the one of the changed score after an undo.
 */
function checkUndoRedo(score: MasterScore, cmd: () => boolean, check?: () => void, relayout = false): void {
    const hash = (): string => {
        if (relayout) {
            layoutScore(score)
        }
        return scoreHash(score, false)
    }
    const before = hash()
    const beforeParts = partNames(score)
    const beforeStaves = score.nstaves()
    expect(cmd()).toBe(true)
    check?.()
    const after = hash()
    const afterParts = partNames(score)
    expect(undo(score)).toBe(true)
    expect(partNames(score)).toEqual(beforeParts)
    expect(score.nstaves()).toBe(beforeStaves)
    expect(hash()).toBe(before)
    expect(redo(score)).toBe(true)
    expect(partNames(score)).toEqual(afterParts)
    expect(hash()).toBe(after)
    check?.()
    expect(undo(score)).toBe(true)
    expect(hash()).toBe(before)
}

function newScore(): MasterScore {
    return createScore({
        ...defaultNewScoreOptions(), measures: 6, order: 'orchestra',
        instruments: [{ id: 'flute' }, { id: 'clarinet' }, { id: 'piano' }, { id: 'violin' }, { id: 'violoncello' }],
    })
}

describe('NotationParts on a created score', () => {
    let score: MasterScore

    beforeAll(async () => {
        await initFonts()
        score = newScore()
    })

    it('hides and shows a part', () => {
        const part = score.parts()[1]
        checkUndoRedo(score, () => setPartVisible(score, part.id(), false), () => expect(part.show()).toBe(false))
        expect(part.show()).toBe(true)
        expect(setPartVisible(score, part.id(), true)).toBe(false) // already visible: no command
    })

    it('hides a staff of the piano', () => {
        const staff = score.parts()[2].staff(1)!
        checkUndoRedo(score, () => setStaffVisible(score, staff.id(), false), () => expect(staff.visible()).toBe(false))
    })

    it('removes instruments', () => {
        const piano = score.parts()[2]
        checkUndoRedo(score, () => removeParts(score, [piano.id()]), () => {
            expect(score.parts()).not.toContain(piano)
            expect(score.nstaves()).toBe(4)
        })
        const flute = score.parts()[0]
        const cello = score.parts()[4]
        checkUndoRedo(score, () => removeParts(score, [flute.id(), cello.id()]), () => expect(score.parts().length).toBe(3))
    })

    it('removes a staff', () => {
        const staff = score.parts()[2].staff(0)!
        checkUndoRedo(score, () => removeStaves(score, [staff.id()]), () => expect(score.parts()[2].nstaves()).toBe(1))
    })

    it('moves instruments and staves', () => {
        const [flute, clarinet, , violin] = score.parts()
        checkUndoRedo(score, () => moveParts(score, [flute.id()], violin.id(), true),
            () => expect(score.parts().map(p => p.instrument().id())).toEqual(['clarinet', 'piano', 'violin', 'flute', 'violoncello']))
        checkUndoRedo(score, () => moveParts(score, [violin.id(), clarinet.id()], flute.id(), false),
            () => expect(score.parts()[0]).toBe(clarinet))
        const piano = score.parts()[2]
        const [rh, lh] = piano.staves()
        checkUndoRedo(score, () => moveStaves(score, [lh.id()], rh.id(), false), () => expect(piano.staves()[0]).toBe(lh))
    })

    it('appends a staff to an instrument', () => {
        const violin = score.parts()[3]
        checkUndoRedo(score, () => appendStaff(score, violin.id()), () => {
            expect(violin.nstaves()).toBe(2)
            expect(score.nstaves()).toBe(7)
            // the new staff has measures, rests and the time signature
            const m = score.firstMeasure()!
            expect(m.mstaves().length).toBe(7)
        })
    })

    it('adds, moves and removes system markings', () => {
        const violin = score.parts()[3].staff(0)!
        checkUndoRedo(score, () => addSystemObjects(score, [violin.id()]), () => expect(violin.isSystemObjectStaff()).toBe(true))
        expect(addSystemObjects(score, [violin.id()])).toBe(true)
        const cello = score.parts()[4].staff(0)!
        checkUndoRedo(score, () => moveSystemObjects(score, violin.id(), cello.id()), () => {
            expect(cello.isSystemObjectStaff()).toBe(true)
            expect(violin.isSystemObjectStaff()).toBe(false)
        })
        checkUndoRedo(score, () => removeSystemObjects(score, [violin.id()]), () => expect(violin.isSystemObjectStaff()).toBe(false))
        checkUndoRedo(score, () => moveSystemObjectLayerBottomStaff(score, true))
        expect(undo(score)).toBe(true)
        expect(violin.isSystemObjectStaff()).toBe(false)
    })

    it('sets the score order', () => {
        checkUndoRedo(score, () => setScoreOrder(score, 'custom'), () => expect(layoutPanelScoreOrder(score).id).toBe('custom'))
        expect(setScoreOrder(score, 'orchestra')).toBe(false) // already set
    })

    it('adds instruments (sorted by the score order) and sets the instruments', () => {
        checkUndoRedo(score, () => addInstruments(score, ['oboe', 'trumpet']),
            () => expect(score.parts().map(p => p.instrument().id())).toEqual(['flute', 'oboe', 'clarinet', 'trumpet', 'piano', 'violin', 'violoncello']))
        const ids = score.parts().map(p => p.id())
        checkUndoRedo(score, () => setInstruments(score, [{ partId: ids[4] }, { instrumentId: 'viola' }, { partId: ids[0] }], 'custom'),
            () => expect(score.parts().map(p => p.instrument().id())).toEqual(['violoncello', 'viola', 'flute']))
    })
})

describe('NotationParts on a single-staff and a piano score', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('adds an instrument to and removes the only instrument of a score', () => {
        const score = createScore({ ...defaultNewScoreOptions(), instruments: [{ id: 'piano' }], measures: 3 })
        checkUndoRedo(score, () => addInstruments(score, ['violin']), () => expect(score.parts().length).toBe(2))
        checkUndoRedo(score, () => removeStaves(score, [score.staves()[1].id()]), () => expect(score.nstaves()).toBe(1))
        checkUndoRedo(score, () => appendStaff(score, score.parts()[0].id()), () => expect(score.nstaves()).toBe(3))
    })
})

describe.skipIf(!hasSubmodule)('NotationParts on real scores', () => {
    // spanners crossing staves (cross-staff slurs, hairpins, ...), lyrics, system markings, excerpts
    const files = [
        `${DEMOS}/Reunion.mscz`,
        `${DEMOS}/Amazing_grace.mscz`,
        `${VTEST}/slurs-13.mscz`,
        `${VTEST}/hairpins-1.mscx`,
    ]

    for (const file of files) {
        it(`edits the parts of ${file.split('/').pop()}`, async () => {
            const score = await openScore(file)
            const parts = score.parts()
            const first = parts[0]
            const last = parts[parts.length - 1]
            checkUndoRedo(score, () => setPartVisible(score, first.id(), false), undefined, true)
            if (parts.length > 1) {
                checkUndoRedo(score, () => removeParts(score, [first.id()]), undefined, true)
                checkUndoRedo(score, () => moveParts(score, [first.id()], last.id(), true), undefined, true)
            }
            checkUndoRedo(score, () => appendStaff(score, last.id()), undefined, true)
            if (score.nstaves() > 1) {
                checkUndoRedo(score, () => removeStaves(score, [score.staves()[score.nstaves() - 1].id()]), undefined, true)
                checkUndoRedo(score, () => addSystemObjects(score, [score.staves()[1].id()]), undefined, true)
            }
            checkUndoRedo(score, () => addInstruments(score, ['trumpet']), undefined, true)
        }, 60000)
    }

    it('replacing the instrument of a part renames its part score; undo restores it', async () => {
        const score = await openScore(`${VTEST}/lyrics-15.mscz`)
        const excerpt = score.excerpts()[0]
        const part = score.parts().find(p => p.id() === excerpt.initialPartId())!
        const oldName = excerpt.name()
        expect(score.excerptsChanged()).toBe(false)
        expect(replacePartInstrument(score, part.id(), 'flute')).toBe(true)
        expect(part.instrument().id()).toBe('flute')
        expect(excerpt.name()).toBe('Flute')
        expect(score.excerptsChanged()).toBe(true)
        expect(undo(score)).toBe(true)
        expect(excerpt.name()).toBe(oldName)
    })

    it('removing an instrument deletes its part score; undo restores it', async () => {
        const score = await openScore(`${VTEST}/lyrics-15.mscz`)
        expect(score.excerpts().length).toBe(1)
        const excerpt = score.excerpts()[0]
        const part = score.parts().find(p => p.id() === excerpt.initialPartId())!
        expect(addInstruments(score, ['flute'])).toBe(true)
        checkUndoRedo(score, () => removeParts(score, [part.id()]), () => {
            expect(score.excerpts().length).toBe(0)
            expect(score.parts().length).toBe(1)
        }, true)
        expect(score.excerpts()).toEqual([excerpt])
        // the part score's staves are linked to the main score's again: the score with its part can be saved
        expect(saveMscz(score).length).toBeGreaterThan(0)
        // removing a staff removes it in the part score too
        const staffCount = excerpt.excerptScore()!.nstaves()
        expect(appendStaff(score, part.id())).toBe(true)
        expect(removeStaves(score, [part.staff(0)!.id()])).toBe(true)
        expect(excerpt.excerptScore()!.nstaves()).toBe(staffCount - 1)
        expect(undo(score)).toBe(true)
        expect(excerpt.excerptScore()!.nstaves()).toBe(staffCount)
    }, 60000)
})
