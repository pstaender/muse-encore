/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/stringtunings.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, TextStyleType } from '../types/types'
import { TConv } from '../types/typesconv'
import { Sid } from '../style/styledef'
import { arg, mtrc } from '../../framework/global/translation'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid, PropertyFlags } from './property'
import { StaffTextBase } from './stafftextbase'
import { StringData } from './stringdata'
import { pitch2string } from './utils'

const STRING_TUNINGS_STYLE: ElementStyle = [
    { sid: Sid.staffTextPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.staffTextMinDistance, pid: Pid.MIN_DISTANCE },
]

/** C++ undo command ChangeStringData (editing/editpart.h), set by editing/editpart.ts (import cycles) */
export const stringTuningsHooks: {
    changeStringData: ((st: StringTunings, stringData: StringData) => void) | null
} = { changeStringData: null }

export class StringTunings extends StaffTextBase {
    private m_preset = ''
    private m_visibleStrings: number[] = []
    private m_stringData = new StringData()

    private m_noStringVisible = false
    private m_stringsNumber: number | undefined = undefined

    constructor(parent: EngravingObject | null, textStyleType: TextStyleType = TextStyleType.STRING_TUNINGS) {
        super(ElementType.STRING_TUNINGS, parent, textStyleType, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.initElementStyle(STRING_TUNINGS_STYLE)
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_visibleStrings = [...original.m_visibleStrings]
        this.m_stringData = original.m_stringData.clone()
    }

    override isEditable(): boolean { return false }

    override getProperty(id: Pid): PropertyValue {
        if (id === Pid.STRINGTUNINGS_STRINGS_COUNT) {
            const tick = this.tick()
            const staff = this.staff()!
            if (staff.isTabStaff(tick)) {
                return staff.lines(tick)
            } else {
                for (const _staff of staff.staffList()) {
                    if (_staff === staff) {
                        continue
                    }

                    if (_staff.score() === staff.score() && _staff.isTabStaff(tick)) {
                        return _staff.lines(tick)
                    }
                }
            }

            if (this.m_stringsNumber !== undefined) {
                return this.m_stringsNumber
            }

            return this.stringData().strings()
        } else if (id === Pid.STRINGTUNINGS_PRESET) {
            return this.m_preset
        } else if (id === Pid.STRINGTUNINGS_VISIBLE_STRINGS) {
            return [...this.m_visibleStrings]
        }

        return super.getProperty(id)
    }

    override propertyDefault(id: Pid): PropertyValue {
        if (id === Pid.STRINGTUNINGS_STRINGS_COUNT) {
            return this.stringData().strings()
        } else if (id === Pid.STRINGTUNINGS_PRESET) {
            return ''
        } else if (id === Pid.STRINGTUNINGS_VISIBLE_STRINGS) {
            return []
        }

        return super.propertyDefault(id)
    }

    override setProperty(id: Pid, val: PropertyValue): boolean {
        if (id === Pid.STRINGTUNINGS_STRINGS_COUNT) {
            const tick = this.tick()
            const staff = this.staff()!
            if (staff.isTabStaff(tick)) {
                staff.staffType(tick).setLines(val as number)
            } else {
                for (const _staff of staff.staffList()) {
                    if (_staff === staff) {
                        continue
                    }

                    if (_staff.score() === staff.score() && _staff.isTabStaff(tick)) {
                        _staff.staffType(tick).setLines(val as number)
                    }
                }
            }

            this.m_stringsNumber = val as number
        } else if (id === Pid.STRINGTUNINGS_PRESET) {
            this.m_preset = val as string
        } else if (id === Pid.STRINGTUNINGS_VISIBLE_STRINGS) {
            this.m_visibleStrings = [...(val as number[])]
        } else {
            return super.setProperty(id, val)
        }

        this.triggerLayout()
        return true
    }

    override accessibleInfo(): string {
        const stringData = this.stringData()
        if (stringData.isNull()) {
            return ''
        }

        const elementName = this.score() ? this.score().getTextStyleUserName(TextStyleType.STRING_TUNINGS).translated()
            : TConv.userNameTextStyleType(TextStyleType.STRING_TUNINGS).translated()
        let info = ''

        const stringList = stringData.stringList()
        const numOfStrings = stringList.length
        for (let i = 0; i < numOfStrings; ++i) {
            const index = numOfStrings - i - 1
            if (this.m_visibleStrings.includes(index)) {
                const str = stringList[index]
                const pitchStr = pitch2string(str.pitch, str.useFlat)
                if (!pitchStr) {
                    continue
                }

                info += arg(mtrc('engraving', 'String %1'), String(i + 1)) + ', '
                        + arg(mtrc('engraving', 'Value %1'), pitchStr) + '; '
            }
        }

        return `${elementName}: ${info}`
    }

    stringData(): StringData { return this.m_stringData }

    setStringData(stringData: StringData): void {
        this.m_stringData.set(stringData)
        this.triggerLayout()
    }

    undoStringData(stringData: StringData): void {
        stringTuningsHooks.changeStringData!(this, stringData)
        this.triggerLayout()
    }

    preset(): string { return this.m_preset }
    setPreset(preset: string): void { this.m_preset = preset }

    visibleStrings(): number[] { return this.m_visibleStrings }
    setVisibleStrings(visibleStrings: number[]): void { this.m_visibleStrings = visibleStrings }

    updateText(): void {
        const updatedText = this.generateText()
        this.undoChangeProperty(Pid.TEXT, updatedText, PropertyFlags.STYLED)

        this.m_noStringVisible = updatedText.length === 0
    }

    noStringVisible(): boolean { return this.m_noStringVisible }

    override triggerLayout(): void {
        const part = this.part()
        if (!part) {
            super.triggerLayout()
            return
        }

        const startTick = this.tick()

        const allStringTuningsOnThisPart = part.stringTunings()
        const iterOfNextStringTuningOnThisPart = allStringTuningsOnThisPart.upperBound(startTick.ticks())
        const nextStringTuning = iterOfNextStringTuningOnThisPart < allStringTuningsOnThisPart.size()
            ? allStringTuningsOnThisPart.valueAt(iterOfNextStringTuningOnThisPart) : null

        const endTick = nextStringTuning ? nextStringTuning.tick() : this.score().endTick()

        this.score().setLayoutRange(startTick, endTick, this.staffIdx(), this.staffIdx(), this)
    }

    private generateText(): string {
        const stringData = this.stringData()
        if (!stringData || stringData.isNull()) {
            return ''
        }

        const guitarStringSymbol = (i: number): string => `<sym>guitarString${i}</sym>`

        const stringList = stringData.stringList()
        const visibleStringList: string[] = []
        const numOfStrings = stringList.length
        for (let i = 0; i < numOfStrings; ++i) {
            const index = numOfStrings - i - 1
            if (this.m_visibleStrings.includes(index)) {
                const str = stringList[index]
                const pitchStr = pitch2string(str.pitch, str.useFlat)
                if (!pitchStr) {
                    continue
                }

                let accidental = ''
                if (pitchStr.length > 1) {
                    const sym = pitchStr[1]
                    if (!/\d/.test(sym)) {
                        accidental = sym
                    }
                }

                visibleStringList.push(guitarStringSymbol(i + 1) + ' – ' + pitchStr[0].toUpperCase() + accidental + '  ')
            }
        }

        if (visibleStringList.length === 0) {
            return ''
        }

        let columnCount = 0
        let rowCount = 0

        if (visibleStringList.length < 4) {
            rowCount = visibleStringList.length
            columnCount = 1
        } else {
            rowCount = Math.ceil(visibleStringList.length / 2)
            columnCount = 2
        }

        let result = ''
        for (let i = 0; i < rowCount; ++i) {
            for (let j = 0; j < columnCount; ++j) {
                const index = i + j * rowCount
                if (index < visibleStringList.length) {
                    result += visibleStringList[index]
                }
                result += '\t'
            }
            result += '\n'
        }

        return result
    }
}
