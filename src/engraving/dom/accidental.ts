/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/accidental.h/.cpp
 */

import { RealIsEqual } from '../../framework/global/realfn'
import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { SymNames } from '../types/symnames'
import { AccidentalRole, AccidentalVal, ElementType } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import { Pid } from './property'
import { setSym2accidentalValHook } from './key'
import { noteFactories, type Note } from './note'
import { ACC_LIST, AccidentalType } from './accidentaldata'
import type { TranslatableString } from '../../framework/global/types/translatablestring'
import type { EditData } from '../editing/editdata'

export { AccidentalType } from './accidentaldata'

export enum AccidentalBracket {
    NONE,
    PARENTHESIS,
    BRACKET,
    BRACE, //! Deprecated; removed from the UI and kept here only for compatibility purposes
}

export function sym2accidentalVal(id: SymId): AccidentalVal {
    for (const a of ACC_LIST) {
        if (a.sym === id) {
            return a.offset
        }
    }
    return AccidentalVal.NATURAL
}

export interface AccidentalSym {
    sym: SymId
    x: number
    y: number
}

export class AccidentalLayoutData extends LayoutData {
    syms: AccidentalSym[] = []
    stackingNumber = 0
    verticalSubgroup = 0
    column = 0
    octaves: Accidental[] = []
    seconds: Accidental[] = []

    override isValid(): boolean { return super.isValid() && this.syms.length > 0 }
}

export class Accidental extends EngravingItem {
    private m_accidentalType = AccidentalType.NONE
    private m_bracket = AccidentalBracket.NONE
    private m_role = AccidentalRole.AUTO
    private m_isSmall = false
    private m_stackingOrderOffset = 0

    constructor(parent: EngravingItem | null) {
        super(ElementType.ACCIDENTAL, parent, ElementFlag.MOVABLE)
    }

    protected override createLayoutData(): AccidentalLayoutData { return new AccidentalLayoutData(this) }
    override ldata(): AccidentalLayoutData { return super.ldata() as AccidentalLayoutData }
    override mutldata(): AccidentalLayoutData { return super.ldata() as AccidentalLayoutData }

    note(): Note | null {
        const p = this.explicitParent()
        return p && p.isNote() ? p as unknown as Note : null
    }

    override acceptDrop(data: EditData): boolean {
        const e = data.dropElement!

        if (e.isAccidental()) {
            return !!this.note()
        }

        // TODO(port): ActionIcon PARENTHESES / BRACKETS (ACCIDENTAL_BRACKET)
        return false
    }

    override drop(data: EditData): EngravingItem | null {
        const e = data.dropElement!
        switch (e.type()) {
        case ElementType.ACCIDENTAL:
            this.score().changeNoteAccidental(this.note()!, (e as Accidental).accidentalType())
            break
        default:
            break
        }
        return null
    }

    override subtype(): number { return this.m_accidentalType }

    setSubtype(tag: string): void { this.setAccidentalType(Accidental.name2subtype(tag)) }

    setAccidentalType(t: AccidentalType): void {
        this.m_accidentalType = t
        const n = this.note()
        if (n) {
            n.setCentOffset(Accidental.subtype2centOffset(t))
        }
    }

    accidentalType(): AccidentalType { return this.m_accidentalType }
    setRole(r: AccidentalRole): void { this.m_role = r }
    role(): AccidentalRole { return this.m_role }
    bracket(): AccidentalBracket { return this.m_bracket }
    setBracket(val: AccidentalBracket): void { this.m_bracket = val }
    isSmall(): boolean { return this.m_isSmall }
    setSmall(val: boolean): void { this.m_isSmall = val }

    parentNoteHasParentheses(): boolean {
        // TODO(port): note parentheses
        return false
    }

    symId(): SymId { return ACC_LIST[this.accidentalType()].sym }

    /** return effective pitch offset */
    static subtype2value(st: AccidentalType): AccidentalVal { return ACC_LIST[st].offset }
    static subtype2symbol(st: AccidentalType): SymId { return ACC_LIST[st].sym }
    static subtype2name(st: AccidentalType): string { return SymNames.nameForSymId(ACC_LIST[st].sym) }
    static subtype2centOffset(st: AccidentalType): number { return ACC_LIST[st].centOffset }

    static centOffset2Subtype(centOffset: number): AccidentalType {
        for (let i = 0; i < AccidentalType.END; ++i) {
            if (RealIsEqual(ACC_LIST[i].centOffset, centOffset)) {
                return i as AccidentalType
            }
        }
        return AccidentalType.NONE
    }

    static value2subtype(v: AccidentalVal): AccidentalType {
        switch (v) {
        case AccidentalVal.NATURAL: return AccidentalType.NONE
        case AccidentalVal.SHARP: return AccidentalType.SHARP
        case AccidentalVal.SHARP2: return AccidentalType.SHARP2
        case AccidentalVal.SHARP3: return AccidentalType.SHARP3
        case AccidentalVal.FLAT: return AccidentalType.FLAT
        case AccidentalVal.FLAT2: return AccidentalType.FLAT2
        case AccidentalVal.FLAT3: return AccidentalType.FLAT3
        default:
            return AccidentalType.NONE
        }
    }

    static value2MicrotonalSubtype(val: AccidentalVal, quarterOff: number): AccidentalType {
        if (quarterOff === 0 || quarterOff < -1 || quarterOff > 1) {
            return Accidental.value2subtype(val)
        }
        switch (val) {
        case AccidentalVal.NATURAL:
            return quarterOff === 1 ? AccidentalType.SHARP_ARROW_DOWN : AccidentalType.FLAT_ARROW_UP
        case AccidentalVal.FLAT:
            return quarterOff === 1 ? AccidentalType.FLAT_ARROW_UP : AccidentalType.FLAT_ARROW_DOWN
        case AccidentalVal.SHARP:
            return quarterOff === 1 ? AccidentalType.SHARP_ARROW_UP : AccidentalType.SHARP_ARROW_DOWN
        case AccidentalVal.FLAT2:
            return quarterOff === 1 ? AccidentalType.FLAT2_ARROW_UP : AccidentalType.FLAT2_ARROW_DOWN
        case AccidentalVal.SHARP2:
            return quarterOff === 1 ? AccidentalType.SHARP2_ARROW_UP : AccidentalType.SHARP2_ARROW_DOWN
        default:
            return Accidental.value2subtype(val)
        }
    }

    static name2subtype(tag: string): AccidentalType {
        const symId = SymNames.symIdByName(tag)
        if (symId !== SymId.noSym) {
            const i = ACC_LIST.findIndex(acc => acc.sym === symId)
            if (i >= 0) {
                return i as AccidentalType
            }
        }
        return AccidentalType.NONE
    }

    static isMicrotonal(t: AccidentalType): boolean { return t > AccidentalType.FLAT3 }

    stackingOrder(): number { return this.ldata().stackingNumber + this.m_stackingOrderOffset }
    stackingOrderOffset(): number { return this.m_stackingOrderOffset }
    setStackingOrderOffset(v: number): void { this.m_stackingOrderOffset = v }

    line(): number {
        const n = this.note()
        return n ? n.line() : 0
    }

    computeMag(): void {
        let m = this.explicitParent() ? this.parentItem()!.mag() : 1.0
        if (this.isSmall()) {
            m *= this.style().styleD(Sid.smallNoteMag)
        }
        this.mutldata().setMag(m)
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.ACCIDENTAL_TYPE: return this.m_accidentalType
        case Pid.SMALL: return this.m_isSmall
        case Pid.ACCIDENTAL_BRACKET: return this.bracket()
        case Pid.ACCIDENTAL_ROLE: return this.role()
        case Pid.ACCIDENTAL_STACKING_ORDER_OFFSET: return this.stackingOrderOffset()
        default:
            return super.getProperty(propertyId)
        }
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.ACCIDENTAL_TYPE: return AccidentalType.NONE
        case Pid.SMALL: return false
        case Pid.ACCIDENTAL_BRACKET: return AccidentalBracket.NONE
        case Pid.ACCIDENTAL_ROLE: return AccidentalRole.AUTO
        case Pid.ACCIDENTAL_STACKING_ORDER_OFFSET: return 0
        default:
            return super.propertyDefault(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.ACCIDENTAL_TYPE:
            this.setAccidentalType(v as AccidentalType)
            break
        case Pid.SMALL:
            this.m_isSmall = !!v
            break
        case Pid.ACCIDENTAL_BRACKET:
            this.m_bracket = v as AccidentalBracket
            break
        case Pid.ACCIDENTAL_ROLE:
            this.m_role = v as AccidentalRole
            break
        case Pid.ACCIDENTAL_STACKING_ORDER_OFFSET:
            this.setStackingOrderOffset(v as number)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override subtypeUserName(): TranslatableString {
        return SymNames.userNameForSymId(this.symId())
    }

    override accessibleInfo(): string {
        return `${this.translatedTypeUserName()}: ${this.translatedSubtypeUserName()}`
    }
}

setSym2accidentalValHook(sym2accidentalVal)

noteFactories.createAccidental = (note: Note) => new Accidental(note)
noteFactories.accidental = {
    subtype2centOffset: Accidental.subtype2centOffset,
    centOffset2Subtype: Accidental.centOffset2Subtype,
    value2subtype: Accidental.value2subtype,
    value2MicrotonalSubtype: Accidental.value2MicrotonalSubtype,
    subtype2value: Accidental.subtype2value,
    isMicrotonal: Accidental.isMicrotonal,
    NONE: AccidentalType.NONE,
    NATURAL: AccidentalType.NATURAL,
}
