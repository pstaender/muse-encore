/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editfretboarddiagram.h/.cpp
 */

import type { EngravingObject } from '../dom/engravingobject'
import type { FBox } from '../dom/box'
import type { FretDiagram, FretDiagramData, FretDotType, FretMarkerType } from '../dom/fret'
import type { EditData } from './editdata'
import { CommandType, UndoCommand } from './undo'

/** C++ FretUndoData: the old barres, markers, dots and properties, since predicting how adding dots, markers, barres
 * etc. will change things is too difficult */
export class FretUndoData {
    private m_diagram: FretDiagram | null = null
    private m_data: FretDiagramData | null = null

    constructor(fd: FretDiagram | null = null) {
        if (fd) {
            this.m_diagram = fd
            this.m_data = fd.fretUndoData()
        }
    }

    updateDiagram(): void {
        if (!this.m_diagram || !this.m_data) {
            // C++ ASSERT_X("Tried to undo fret diagram change without ever setting diagram!")
            return
        }

        // Reset every fret diagram property of the changed diagram
        this.m_diagram.restoreFretUndoData(this.m_data)
    }
}

export class FretDataChange extends UndoCommand {
    private m_undoData = new FretUndoData()

    constructor(private m_diagram: FretDiagram, private m_harmonyName: string) {
        super()
    }

    override redo(_ed: EditData | null): void {
        this.m_undoData = new FretUndoData(this.m_diagram)

        this.m_diagram.updateDiagram(this.m_harmonyName)
    }

    override undo(_ed: EditData | null): void {
        this.m_undoData.updateDiagram()
    }

    override type(): CommandType { return CommandType.FretDataChange }
    override name(): string { return 'FretDataChange' }
    override objectItems(): EngravingObject[] { return [this.m_diagram] }
}

export class FretDot extends UndoCommand {
    private undoData = new FretUndoData()

    constructor(private diagram: FretDiagram, private string: number, private fret: number, private add = false,
        private dtype: FretDotType = 0 as FretDotType) {
        super()
    }

    override redo(_ed: EditData | null): void {
        this.undoData = new FretUndoData(this.diagram)

        this.diagram.setDot(this.string, this.fret, this.add, this.dtype)
        this.diagram.triggerLayout()
    }

    override undo(_ed: EditData | null): void {
        this.undoData.updateDiagram()
        this.diagram.triggerLayout()
    }

    override type(): CommandType { return CommandType.FretDot }
    override name(): string { return 'FretDot' }
    override objectItems(): EngravingObject[] { return [this.diagram] }
}

export class FretMarker extends UndoCommand {
    private undoData = new FretUndoData()

    constructor(private diagram: FretDiagram, private string: number, private mtype: FretMarkerType) {
        super()
    }

    override redo(_ed: EditData | null): void {
        this.undoData = new FretUndoData(this.diagram)

        this.diagram.setMarker(this.string, this.mtype)
        this.diagram.triggerLayout()
    }

    override undo(_ed: EditData | null): void {
        this.undoData.updateDiagram()
        this.diagram.triggerLayout()
    }

    override type(): CommandType { return CommandType.FretMarker }
    override name(): string { return 'FretMarker' }
    override objectItems(): EngravingObject[] { return [this.diagram] }
}

export class FretBarre extends UndoCommand {
    private undoData = new FretUndoData()

    constructor(private diagram: FretDiagram, private string: number, private fret: number, private add = false) {
        super()
    }

    override redo(_ed: EditData | null): void {
        this.undoData = new FretUndoData(this.diagram)

        this.diagram.setBarreForString(this.string, this.fret)
        this.diagram.triggerLayout()
    }

    override undo(_ed: EditData | null): void {
        this.undoData.updateDiagram()
        this.diagram.triggerLayout()
    }

    override type(): CommandType { return CommandType.FretBarre }
    override name(): string { return 'FretBarre' }
    override objectItems(): EngravingObject[] { return [this.diagram] }
}

export class FretClear extends UndoCommand {
    private undoData = new FretUndoData()

    constructor(private diagram: FretDiagram) {
        super()
    }

    override redo(_ed: EditData | null): void {
        this.undoData = new FretUndoData(this.diagram)

        this.diagram.clear()
        this.diagram.triggerLayout()
    }

    override undo(_ed: EditData | null): void {
        this.undoData.updateDiagram()
        this.diagram.triggerLayout()
    }

    override type(): CommandType { return CommandType.FretClear }
    override name(): string { return 'FretClear' }
    override objectItems(): EngravingObject[] { return [this.diagram] }
}

export class AddFretDiagramToFretBox extends UndoCommand {
    constructor(private m_fretDiagram: FretDiagram, private m_idx: number) {
        super()
    }

    override redo(_ed: EditData | null): void {
        const fbox = this.m_fretDiagram.parent() as unknown as FBox
        fbox.addAtIdx(this.m_fretDiagram, this.m_idx)
    }

    override undo(_ed: EditData | null): void {
        const fbox = this.m_fretDiagram.parent() as unknown as FBox
        fbox.remove(this.m_fretDiagram)
    }

    override type(): CommandType { return CommandType.AddFretDiagramToFretBox }
    override name(): string { return 'AddFretDiagramToFretBox' }
    override objectItems(): EngravingObject[] { return [this.m_fretDiagram] }
}

export class RemoveFretDiagramFromFretBox extends UndoCommand {
    private m_idx: number

    constructor(private m_fretDiagram: FretDiagram) {
        super()
        const fbox = m_fretDiagram.parent() as unknown as FBox
        this.m_idx = fbox.el().indexOf(m_fretDiagram)
    }

    override redo(_ed: EditData | null): void {
        const fbox = this.m_fretDiagram.parent() as unknown as FBox
        fbox.remove(this.m_fretDiagram)
    }

    override undo(_ed: EditData | null): void {
        const fbox = this.m_fretDiagram.parent() as unknown as FBox
        fbox.addAtIdx(this.m_fretDiagram, this.m_idx)
    }

    override type(): CommandType { return CommandType.RemoveFretDiagramFromFretBox }
    override name(): string { return 'RemoveFretDiagramFromFretBox' }
    override objectItems(): EngravingObject[] { return [this.m_fretDiagram] }
}
