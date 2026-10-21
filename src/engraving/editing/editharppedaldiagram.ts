/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editharppedaldiagram.h/.cpp
 */

import { harpPedalDiagramHooks, type HarpPedalDiagram, type HarpStringType, type PedalPosition } from '../dom/harppedaldiagram'
import type { EngravingObject } from '../dom/engravingobject'
import { UndoCommand } from './undo'
import type { EditData } from './editdata'
import './edit'
import '../dom/navigate'

function objectItemsFor(diagram: HarpPedalDiagram): EngravingObject[] {
    const part = diagram.part()
    const objs: EngravingObject[] = [diagram]
    if (!part) {
        return objs
    }

    const nextDiagram = part.nextHarpDiagram(diagram.tick())
    if (nextDiagram) {
        objs.push(nextDiagram)
    } else {
        const last = diagram.score().lastElement()
        if (last) {
            objs.push(last)
        }
    }
    return objs
}

//---------------------------------------------------------
//   ChangeHarpPedalState
//---------------------------------------------------------

export class ChangeHarpPedalState extends UndoCommand {
    constructor(private diagram: HarpPedalDiagram, private pedalState: PedalPosition[]) {
        super()
    }

    protected override flip(_ed: EditData | null): void {
        const fState = this.diagram.getPedalState()
        if (fState.every((v, i) => v === this.pedalState[i])) {
            return
        }

        this.diagram.setPedalState(this.pedalState)
        this.pedalState = fState

        this.diagram.triggerLayout()
    }

    override name(): string { return 'ChangeHarpPedalState' }
    override objectItems(): EngravingObject[] { return objectItemsFor(this.diagram) }
}

//---------------------------------------------------------
//   ChangeSingleHarpPedal
//---------------------------------------------------------

export class ChangeSingleHarpPedal extends UndoCommand {
    private harpString: HarpStringType

    constructor(private diagram: HarpPedalDiagram, harpString: HarpStringType, private pos: PedalPosition) {
        super()
        this.harpString = harpString
    }

    protected override flip(_ed: EditData | null): void {
        const fType = this.harpString
        const fPos = this.diagram.getPedalState()[this.harpString]
        if (fPos === this.pos) {
            return
        }

        this.diagram.setPedal(this.harpString, this.pos)
        this.harpString = fType
        this.pos = fPos

        this.diagram.triggerLayout()
    }

    override name(): string { return 'ChangeSingleHarpPedal' }
    override objectItems(): EngravingObject[] { return objectItemsFor(this.diagram) }
}

harpPedalDiagramHooks.changeHarpPedalState = (item: HarpPedalDiagram, state: PedalPosition[]): void => {
    item.score().undo(new ChangeHarpPedalState(item, state))
}
