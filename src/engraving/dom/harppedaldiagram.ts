/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/harppedaldiagram.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { AccidentalVal, ElementType, TextStyleType } from '../types/types'
import { TConv } from '../types/typesconv'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid, PropertyFlags } from './property'
import type { Measure } from './measure'
import type { Segment } from './segment'
import { TextBase } from './textbase'
import { accidentalUserName, step2tpc } from './pitchspelling'

export enum PedalPosition {
    FLAT,
    NATURAL,
    SHARP,

    UNSET, // Only used in setDiagramText to represent the beginning of a score
}

// Use for indexes of _pedalState
export enum HarpStringType {
    D, C, B, E, F, G, A,
}

// Number of strings per octave on a harp
export const HARP_STRING_NO = 7

// Position of separator character in diagram
const SEPARATOR_IDX = 3

function harpStringTypeToString(type: HarpStringType): string {
    switch (type) {
    case HarpStringType.A: return 'A'
    case HarpStringType.B: return 'B'
    case HarpStringType.C: return 'C'
    case HarpStringType.D: return 'D'
    case HarpStringType.E: return 'E'
    case HarpStringType.F: return 'F'
    case HarpStringType.G: return 'G'
    }
    return ''
}

// STYLE
const harpPedalDiagramStyle: ElementStyle = [
    { sid: Sid.harpPedalDiagramPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.harpPedalDiagramMinDistance, pid: Pid.MIN_DISTANCE },
]

const harpPedalTextDiagramStyle: ElementStyle = [
    { sid: Sid.harpPedalTextDiagramPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.harpPedalTextDiagramMinDistance, pid: Pid.MIN_DISTANCE },
]

/** C++ undo command ChangeHarpPedalState (editing/editharppedaldiagram.h), set by editing/editharppedaldiagram.ts */
export const harpPedalDiagramHooks: {
    changeHarpPedalState: ((item: HarpPedalDiagram, state: PedalPosition[]) => void) | null
} = { changeHarpPedalState: null }

const string2step = new Map<HarpStringType, number>([
    [HarpStringType.C, 0],
    [HarpStringType.D, 1],
    [HarpStringType.E, 2],
    [HarpStringType.F, 3],
    [HarpStringType.G, 4],
    [HarpStringType.A, 5],
    [HarpStringType.B, 6],
])

const position2accidentalVal = new Map<PedalPosition, AccidentalVal>([
    [PedalPosition.FLAT, AccidentalVal.FLAT],
    [PedalPosition.NATURAL, AccidentalVal.NATURAL],
    [PedalPosition.SHARP, AccidentalVal.SHARP],
])

export class HarpPedalDiagram extends TextBase {
    private m_pedalState: PedalPosition[]
    private m_playableTpcs = new Set<number>()
    private m_isDiagram = true

    constructor(parent: EngravingObject | null) {
        super(ElementType.HARP_DIAGRAM, parent, TextStyleType.HARP_PEDAL_DIAGRAM, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.initElementStyle(harpPedalDiagramStyle)
        this.m_pedalState = new Array<PedalPosition>(HARP_STRING_NO).fill(PedalPosition.NATURAL)
        this.setPlayableTpcs()
    }

    /** C++ copy constructor */
    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_pedalState = [...original.m_pedalState]
        this.m_isDiagram = original.m_isDiagram
        this.setPlayableTpcs()
    }

    override isEditable(): boolean { return false }

    segment(): Segment | null {
        const p = this.explicitParent()
        return p && p.isSegment() ? p as unknown as Segment : null
    }

    measure(): Measure | null {
        const s = this.segment()
        return s ? s.measure() : null
    }

    setPlayableTpcs(): void {
        const playableTpcs = new Set<number>()

        for (let i = 0; i < this.m_pedalState.length; i++) {
            const stringStep = string2step.get(i as HarpStringType)!
            const accidentalVal = position2accidentalVal.get(this.m_pedalState[i])!
            const resTpc = step2tpc(stringStep, accidentalVal)
            playableTpcs.add(resTpc)
        }

        this.m_playableTpcs = playableTpcs
    }

    setIsDiagram(diagram: boolean): void {
        this.m_isDiagram = diagram
        const styleMap = this.m_isDiagram ? harpPedalDiagramStyle : harpPedalTextDiagramStyle

        if (this.m_isDiagram) {
            this.setTextStyleType(TextStyleType.HARP_PEDAL_DIAGRAM)
        } else {
            this.setTextStyleType(TextStyleType.HARP_PEDAL_TEXT_DIAGRAM)
        }

        this.initElementStyle(styleMap)
    }

    isDiagram(): boolean { return this.m_isDiagram }

    getPedalState(): PedalPosition[] { return [...this.m_pedalState] }

    setPedalState(state: readonly PedalPosition[]): void {
        this.m_pedalState = [...state]
        this.setPlayableTpcs()
    }

    setPedal(harpString: HarpStringType, pedal: PedalPosition): void {
        this.m_pedalState[harpString] = pedal
        this.setPlayableTpcs()
    }

    createDiagramText(): string {
        let diagram = ''
        if (this.m_isDiagram) {
            for (let idx = 0; idx < this.m_pedalState.length; idx++) {
                if (idx === SEPARATOR_IDX) {
                    // insert separator
                    diagram += '<sym>harpPedalDivider</sym>'
                }
                switch (this.m_pedalState[idx]) {
                case PedalPosition.FLAT:
                    diagram += '<sym>harpPedalRaised</sym>'
                    break
                case PedalPosition.NATURAL:
                    diagram += '<sym>harpPedalCentered</sym>'
                    break
                case PedalPosition.SHARP:
                    diagram += '<sym>harpPedalLowered</sym>'
                    break
                case PedalPosition.UNSET:
                    break
                }
            }
        } else {
            // find difference between pedal state of previous diagram and this one
            // if no previous, the pedals are "unset" meaning the whole diagram will be displayed

            const initState = new Array<PedalPosition>(HARP_STRING_NO).fill(PedalPosition.UNSET)
            let prevState: PedalPosition[]
            let prevDiagram: HarpPedalDiagram | null = null
            const part = this.part()
            if (part && this.segment()) {
                prevDiagram = part.prevHarpDiagram(this.segment()!.tick())
            }

            const equalStates = (a: readonly PedalPosition[], b: readonly PedalPosition[]): boolean => a.every((v, i) => v === b[i])

            if (prevDiagram !== null) {
                // If states are the same work backwards until we find the first difference then calculate from there
                // This ensures the diagram is identical to the previous one
                prevState = prevDiagram.getPedalState()
                while (equalStates(prevState, this.m_pedalState)) {
                    // if states are the same but previous is a diagram write whole config out
                    if (prevDiagram!.isDiagram()) {
                        prevState = initState
                        break
                    }
                    // Check if there's a diagram before.  If not, start of score and use init state
                    prevDiagram = part!.prevHarpDiagram(prevDiagram!.segment()!.tick())
                    if (prevDiagram !== null) {
                        prevState = prevDiagram.getPedalState()
                    } else {
                        // set to init state and break loop
                        prevState = initState
                        break
                    }
                }
            } else {
                prevState = initState
            }

            let topLine = ''
            let bottomLine = ''

            for (let idx = 0; idx < this.m_pedalState.length; idx++) {
                if (this.m_pedalState[idx] !== prevState[idx]) {
                    let strName = harpStringTypeToString(idx as HarpStringType)
                    switch (this.m_pedalState[idx]) {
                    case PedalPosition.FLAT:
                        strName += '<sym>csymAccidentalFlat</sym> '
                        break
                    case PedalPosition.NATURAL:
                        strName += '<sym>csymAccidentalNatural</sym> '
                        break
                    case PedalPosition.SHARP:
                        strName += '<sym>csymAccidentalSharp</sym> '
                        break
                    case PedalPosition.UNSET:
                        break
                    }
                    if (idx < SEPARATOR_IDX) {
                        bottomLine += strName
                    } else {
                        topLine += strName
                    }
                }
            }

            if (topLine.length === 0) {
                diagram += bottomLine
            } else {
                diagram += topLine + '\n' + bottomLine
            }
        }

        return diagram
    }

    updateDiagramText(): void {
        this.undoChangeProperty(Pid.TEXT, this.createDiagramText(), PropertyFlags.STYLED)
    }

    undoChangePedalState(pedalState: readonly PedalPosition[]): void {
        for (const obj of this.linkList()) {
            if (!obj || !obj.isHarpPedalDiagram()) {
                continue
            }

            const item = obj as HarpPedalDiagram
            const linkedScore = item.score()
            if (!linkedScore) {
                continue
            }

            harpPedalDiagramHooks.changeHarpPedalState!(item, [...pedalState])
        }
    }

    isTpcPlayable(tpc: number): boolean { return this.m_playableTpcs.has(tpc) }
    playableTpcs(): ReadonlySet<number> { return this.m_playableTpcs }

    override positionRelativeToNoteheadRest(): boolean { return true }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.HARP_IS_DIAGRAM:
            return this.m_isDiagram
        default:
            return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.HARP_IS_DIAGRAM:
            this.setIsDiagram(v as boolean)
            break
        default:
            if (!super.setProperty(propertyId, v)) {
                return false
            }
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.TEXT_STYLE:
            return TextStyleType.HARP_PEDAL_DIAGRAM
        case Pid.HARP_IS_DIAGRAM:
            return true
        default:
            return super.propertyDefault(id)
        }
    }

    override accessibleInfo(): string {
        const rez = this.score() ? this.score().getTextStyleUserName(this.textStyleType()).translated()
            : TConv.userNameTextStyleType(this.textStyleType()).translated()
        let s = ''

        for (let idx = 0; idx < this.m_pedalState.length; idx++) {
            s += harpStringTypeToString(idx as HarpStringType)
            switch (this.m_pedalState[idx]) {
            case PedalPosition.FLAT:
                s += '♭ '
                break
            case PedalPosition.NATURAL:
                s += '♮ '
                break
            case PedalPosition.SHARP:
                s += '♯ '
                break
            case PedalPosition.UNSET:
                s += ' unset '
                break
            }
        }

        // trim trailing space
        s = s.substring(0, s.length - 1)

        return `${rez}: ${s}`
    }

    screenReaderInfo(): string {
        const rez = this.score() ? this.score().getTextStyleUserName(this.textStyleType()).translated()
            : TConv.userNameTextStyleType(this.textStyleType()).translated()
        let s = ''

        for (let idx = 0; idx < this.m_pedalState.length; idx++) {
            s += harpStringTypeToString(idx as HarpStringType) + ' '
            switch (this.m_pedalState[idx]) {
            case PedalPosition.FLAT:
                s += accidentalUserName(AccidentalVal.FLAT, true)
                break
            case PedalPosition.NATURAL:
                s += accidentalUserName(AccidentalVal.NATURAL, true)
                break
            case PedalPosition.SHARP:
                s += accidentalUserName(AccidentalVal.SHARP, true)
                break
            case PedalPosition.UNSET:
                s += ' unset '
                break
            }
        }

        return `${rez}: ${s}`
    }
}
