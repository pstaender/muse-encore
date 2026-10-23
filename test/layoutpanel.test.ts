// SPDX-License-Identifier: GPL-3.0-only
// The layout panel's tree model (port of MuseScore's LayoutPanelTreeModel): rows of parts, staves, "Add staff"
// controls and system markings layers; selection syncing with the score; the score changes it requests.
import { describe, expect, it } from 'vitest'
import {
    createLayoutPanelModel, createSystemObjectsLayerSettingsModel, InsertMode, LayoutPanelItemType, layoutPanelItemKey, selectAll,
    clearSelection, moveSelection, undo,
    type AbstractLayoutPanelTreeItem, type LayoutPanelNotationParts,
} from '../src/index'
import { DEMOS, VTEST, hasSubmodule, openScore } from './helpers'

function rows(item: AbstractLayoutPanelTreeItem, depth = 0): string[] {
    const res: string[] = []
    for (const c of item.childItems()) {
        res.push(`${'  '.repeat(depth)}${LayoutPanelItemType[c.type()]} ${c.title()}${c.isVisible() ? '' : ' (hidden)'}`)
        res.push(...rows(c, depth + 1))
    }
    return res
}

function recorder(): { calls: string[]; parts: LayoutPanelNotationParts } {
    const calls: string[] = []
    const rec = (name: string) => (...args: unknown[]): void => { calls.push(`${name} ${JSON.stringify(args)}`) }
    return {
        calls,
        parts: {
            setPartVisible: rec('setPartVisible'), setStaffVisible: rec('setStaffVisible'), removeParts: rec('removeParts'),
            removeStaves: rec('removeStaves'), moveParts: rec('moveParts'), moveStaves: rec('moveStaves'),
            appendStaff: rec('appendStaff'), addSystemObjects: rec('addSystemObjects'), removeSystemObjects: rec('removeSystemObjects'),
            moveSystemObjects: rec('moveSystemObjects'), moveSystemObjectLayerBelowBottomStaff: rec('moveSystemObjectLayerBelowBottomStaff'),
            moveSystemObjectLayerAboveBottomStaff: rec('moveSystemObjectLayerAboveBottomStaff'),
            insertPart: (part, index) => { calls.push(`insertPart ${JSON.stringify([part.id(), index])}`) },
            replacePart: (partId, part) => { calls.push(`replacePart ${JSON.stringify([partId, part.id()])}`) },
        },
    }
}

describe.skipIf(!hasSubmodule)('layout panel', () => {
    it('lists the parts with their staves and the system markings layers', async () => {
        const score = await openScore(`${DEMOS}/Amazing_grace.mscz`)
        const model = createLayoutPanelModel(score)
        const root = model.rootItem()!
        const top = root.childItems().map(i => `${LayoutPanelItemType[i.type()]} ${i.title()}`)
        // the top system markings layer (first staff) above the first part; this score has none
        expect(top).toEqual(['SYSTEM_OBJECTS_LAYER System markings', 'PART Soprano', 'PART Alto', 'PART Tenor', 'PART Bass'])
        const soprano = root.childAtRow(1)!
        expect(soprano.isExpandable()).toBe(true)
        expect(soprano.isSelectable()).toBe(true)
        expect(soprano.isRemovable()).toBe(true)
        expect(soprano.childItems().map(i => `${LayoutPanelItemType[i.type()]} ${i.title()}`)).toEqual(['STAFF Treble clef', 'CONTROL_ADD_STAFF Add staff'])
        // the top layer can neither be selected nor removed
        expect(root.childAtRow(0)!.isSelectable()).toBe(false)
        expect(root.childAtRow(0)!.isRemovable()).toBe(false)
        expect(new Set(root.childItems().map(layoutPanelItemKey)).size).toBe(5)
    })

    it('shows the system markings layers of other staves', async () => {
        const score = await openScore(`${VTEST}/brackets.mscx`)
        const model = createLayoutPanelModel(score)
        const types = model.rootItem()!.childItems().map(i => LayoutPanelItemType[i.type()])
        expect(types.filter(t => t === 'SYSTEM_OBJECTS_LAYER').length).toBe(2)
        const all = rows(model.rootItem()!)
        // staff titles are the clef names
        expect(all).toContain('  STAFF Bass clef')
        expect(all).toContain('  STAFF Treble clef 8va bassa')
    })

    it('selects the rows of the parts of the score selection', async () => {
        const score = await openScore(`${DEMOS}/Amazing_grace.mscz`)
        const model = createLayoutPanelModel(score)
        let changes = 0
        model.onChanged = () => changes++
        selectAll(score)
        model.updateSelectedRows()
        expect(model.selectedItems().map(i => i.title())).toEqual(['Soprano', 'Alto', 'Tenor', 'Bass'])
        expect(changes).toBe(1)
        // the staves of a selected part are shown selected too
        expect(model.rootItem()!.childAtRow(1)!.childAtRow(0)!.isSelected()).toBe(true)
        clearSelection(score)
        model.updateSelectedRows()
        expect(model.selectedItems()).toEqual([])
        moveSelection(score, 'End', { shift: false, ctrl: true, alt: false }) // last element: in the bass
        model.updateSelectedRows()
        expect(model.selectedItems().map(i => i.title())).toEqual(['Bass'])
    })

    it('selection model: click, shift+click; moving and removing availability', async () => {
        const score = await openScore(`${DEMOS}/Amazing_grace.mscz`)
        const { calls, parts } = recorder()
        const model = createLayoutPanelModel(score, parts)
        const root = model.rootItem()!
        model.selectRow(root.childAtRow(2)!)
        model.selectRow(root.childAtRow(4)!, { shift: true })
        expect(model.selectedItems().map(i => i.title())).toEqual(['Alto', 'Tenor', 'Bass'])
        expect(model.selectedItemsType()).toBe(LayoutPanelItemType.PART)
        expect(model.isMovingUpAvailable()).toBe(true)
        expect(model.isMovingDownAvailable()).toBe(false)
        expect(model.isRemovingAvailable()).toBe(true)

        // the first part cannot move above the top system markings layer
        model.selectRow(root.childAtRow(1)!)
        expect(model.isMovingUpAvailable()).toBe(false)
        expect(model.isMovingDownAvailable()).toBe(true)
        model.moveSelectedRowsDown()
        expect(calls.length).toBe(1)
        // before the tenor
        expect(calls[0]).toBe('moveParts [["1"],"3",0]') // soprano before the tenor (ids 1-4 in score order)
        expect(root.childItems().map(i => i.title()).slice(1)).toEqual(['Alto', 'Soprano', 'Tenor', 'Bass'])
        expect(InsertMode.After).toBe(1)

        // the only staff of a part cannot be removed
        model.selectRow(root.childAtRow(1)!.childAtRow(0)!)
        expect(model.selectedItemsType()).toBe(LayoutPanelItemType.STAFF)
        expect(model.isRemovingAvailable()).toBe(false)

        // visibility of a staff; a part hides its staves
        model.changeVisibility(root.childAtRow(3)!, false)
        expect(root.childAtRow(3)!.childAtRow(0)!.isVisible()).toBe(false)
        expect(calls.slice(1)).toEqual([
            `setPartVisible ["${root.childAtRow(3)!.id()}",false]`,
            `setStaffVisible ["${root.childAtRow(3)!.childAtRow(0)!.id()}",false]`,
        ])

        root.childAtRow(1)!.childAtRow(1)!.appendNewItem()
        expect(calls[calls.length - 1]).toBe(`appendStaff ["${root.childAtRow(1)!.id()}"]`)

        model.selectRow(root.childAtRow(4)!)
        model.removeSelectedRows()
        expect(calls[calls.length - 2]).toMatch(/^removeParts \[\["\d+"\]\]$/)
        expect(root.childCount()).toBe(4)
    })
})

describe.skipIf(!hasSubmodule)('layout panel drag and drop', () => {
    it('moves the rows while dragging and the score on the drop (startActiveDrag / moveRows / endActiveDrag)', async () => {
        const score = await openScore(`${DEMOS}/Amazing_grace.mscz`)
        const { calls, parts } = recorder()
        const model = createLayoutPanelModel(score, parts)
        const root = model.rootItem()!
        const titles = (): string[] => root.childItems().map(i => i.title())
        const soprano = root.childAtRow(1)!
        model.startActiveDrag()
        // dragged over the alto, then over the tenor
        expect(model.moveRows(root, soprano.row(), 1, root, 2)).toBe(true)
        expect(model.moveRows(root, soprano.row(), 1, root, 3)).toBe(true)
        expect(titles()).toEqual(['System markings', 'Alto', 'Tenor', 'Soprano', 'Bass'])
        expect(calls).toEqual([]) // the score is not changed while dragging
        model.endActiveDrag()
        expect(model.isDragInProgress()).toBe(false)
        expect(calls).toEqual(['moveParts [["1"],"4",0]']) // the soprano before the bass
    })
})

describe.skipIf(!hasSubmodule)('system markings layer settings (SystemObjectsLayerSettingsModel)', () => {
    it('lists the groups of system markings of a layer and hides one, undoable', async () => {
        const score = await openScore(`${VTEST}/layout-sequence-12.mscx`)
        const model = createSystemObjectsLayerSettingsModel(score, score.staves()[0].id())
        const groups = model.groups()
        expect(groups.length).toBeGreaterThan(0)
        expect(groups.every(g => g.isGroupVisible)).toBe(true)
        model.setSystemObjectsGroupVisible(0, false)
        expect(createSystemObjectsLayerSettingsModel(score, score.staves()[0].id()).groups()[0].isGroupVisible).toBe(false)
        undo(score)
        expect(createSystemObjectsLayerSettingsModel(score, score.staves()[0].id()).groups()[0].isGroupVisible).toBe(true)
    })
})
