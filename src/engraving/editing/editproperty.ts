/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editproperty.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { Pid, PropertyFlags } from '../dom/property'
import type { EngravingObject } from '../dom/engravingobject'
import type { EngravingItem } from '../dom/engravingitem'
import type { Staff } from '../dom/staff'
import type { BracketItem } from '../dom/bracketitem'
import type { TextLine } from '../dom/textline'
import { CommandType, UndoCommand, UndoCommandFilter, compoundObjects, updateStaffTextCache } from './undo'
import type { EditData } from './editdata'

export class ChangeProperty extends UndoCommand {
    protected element: EngravingObject | null
    protected id: Pid
    protected property: PropertyValue
    protected flags: PropertyFlags

    constructor(e: EngravingObject | null, i: Pid, v: PropertyValue, ps: PropertyFlags = PropertyFlags.NOSTYLE) {
        super()
        this.element = e
        this.id = i
        this.property = v
        this.flags = ps
    }

    getId(): Pid { return this.id }
    getElement(): EngravingObject | null { return this.element }
    data(): PropertyValue { return this.property }

    override type(): CommandType { return CommandType.ChangeProperty }
    override name(): string { return 'ChangeProperty' }

    override objectItems(): EngravingObject[] {
        return this.element ? compoundObjects(this.element) : []
    }

    override isFiltered(f: UndoCommandFilter, target: EngravingItem): boolean {
        return f === UndoCommandFilter.ChangePropertyLinked && !!this.element && target.linkList().includes(this.element)
    }

    protected override flip(_ed: EditData | null): void {
        const element = this.element!
        const v = element.getProperty(this.id)
        const ps = element.propertyFlags(this.id)

        element.setProperty(this.id, this.property)
        element.setPropertyFlags(this.id, this.flags)

        if (element.isStaffTextBase()) {
            updateStaffTextCache(element as EngravingItem, element.score())
        }
        // the C++ setProperty() implementations call triggerLayout(); most of the port's don't
        if (element.isEngravingItem()) {
            (element as EngravingItem).triggerLayout()
        } else {
            element.score().setLayoutAll()
        }

        this.property = v
        this.flags = ps
    }
}

export class ChangeBracketProperty extends ChangeProperty {
    private staff: Staff | null
    private level: number

    constructor(s: Staff | null, l: number, i: Pid, v: PropertyValue, ps: PropertyFlags = PropertyFlags.NOSTYLE) {
        super(null, i, v, ps)
        this.staff = s
        this.level = l
    }

    override name(): string { return 'ChangeBracketProperty' }
    override objectItems(): EngravingObject[] { return this.staff ? [this.staff] : [] }

    protected override flip(ed: EditData | null): void {
        if (!this.staff) {
            return
        }

        this.element = this.staff.brackets()[this.level]
        super.flip(ed)
        this.level = (this.element as BracketItem).column()
    }
}

export class ChangeTextLineProperty extends ChangeProperty {
    constructor(e: EngravingObject, v: PropertyValue) {
        super(e, Pid.SYSTEM_FLAG, v, PropertyFlags.NOSTYLE)
    }

    override name(): string { return 'ChangeTextLineProperty' }

    protected override flip(ed: EditData | null): void {
        super.flip(ed)
        if (this.element!.isTextLine()) {
            (this.element as unknown as TextLine).initStyle()
        }
    }
}
