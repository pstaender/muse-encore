/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/marker.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, MarkerType, PlacementV, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import type { Measure } from './measure'
import { Pid } from './property'
import { TextBase } from './textbase'
import type { TranslatableString } from '../../framework/global/types/translatablestring'
import { TConv } from '../types/typesconv'

const markerStyle: ElementStyle = [
    { sid: Sid.repeatLeftPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.repeatMinDistance, pid: Pid.MIN_DISTANCE },
]

interface MarkerTypeTableItem {
    type: MarkerType
    text: string
    label: string
    rightAligned: boolean
}

export const markerTypeTable: readonly MarkerTypeTableItem[] = [
    { type: MarkerType.SEGNO, text: '<sym>segno</sym>', label: 'segno', rightAligned: false },
    { type: MarkerType.VARSEGNO, text: '<sym>segnoSerpent1</sym>', label: 'varsegno', rightAligned: false },
    { type: MarkerType.CODA, text: '<sym>coda</sym>', label: 'codab', rightAligned: false },
    { type: MarkerType.VARCODA, text: '<sym>codaSquare</sym>', label: 'varcoda', rightAligned: false },
    { type: MarkerType.CODETTA, text: '<sym>coda</sym><sym>coda</sym>', label: 'codetta', rightAligned: false },
    { type: MarkerType.FINE, text: 'Fine', label: 'fine', rightAligned: true },
    { type: MarkerType.TOCODA, text: 'To Coda', label: 'coda', rightAligned: true },
    { type: MarkerType.TOCODASYM, text: 'To <sym>coda</sym>', label: 'coda', rightAligned: true },
    { type: MarkerType.DA_CODA, text: 'Da Coda', label: 'coda', rightAligned: true },
    { type: MarkerType.DA_DBLCODA, text: 'Da Doppia Coda', label: 'coda', rightAligned: true },
]

const RIGHT_MARKERS: readonly MarkerType[] = [
    MarkerType.FINE,
    MarkerType.TOCODA,
    MarkerType.TOCODASYM,
    MarkerType.DA_CODA,
    MarkerType.DA_DBLCODA,
]

const REPEAT_SYMBOL_NAMES: readonly string[] = [
    '<sym>coda</sym>',
    '<sym>codaSquare</sym>',
    '<sym>codaJapanes</sym>',
    '<sym>segno</sym>',
    '<sym>segnoSerpent1</sym>',
    '<sym>segnoSerpent2</sym>',
    '<sym>segnoJapanese</sym>',
]

export class Marker extends TextBase {
    private m_markerType = MarkerType.FINE
    private m_label = '' // referenced from Jump() element
    private m_centerOnSymbol = true

    constructor(parent: EngravingObject | null, tid: TextStyleType = TextStyleType.REPEAT_LEFT) {
        super(ElementType.MARKER, parent, tid, ElementFlag.MOVABLE | ElementFlag.ON_STAFF | ElementFlag.SYSTEM)
        this.initElementStyle(markerStyle)
        this.resetProperty(Pid.MUSIC_SYMBOL_SIZE)
        this.m_markerType = MarkerType.FINE
    }

    setMarkerType(t: MarkerType): void {
        const changeLabel = this.getProperty(Pid.LABEL) === this.propertyDefault(Pid.LABEL)
        this.m_markerType = t
        for (const p of markerTypeTable) {
            if (p.type === t) {
                if (this.empty()) {
                    this.setXmlText(p.text)
                }
                if (changeLabel) {
                    this.setLabel(p.label)
                }
                const ts = p.rightAligned ? TextStyleType.REPEAT_RIGHT : TextStyleType.REPEAT_LEFT
                if (this.textStyleType() !== ts) {
                    this.initTextStyleType(ts)
                }
                break
            }
        }
    }

    markerType(): MarkerType { return this.m_markerType }

    isSegno(): boolean { return this.m_markerType === MarkerType.SEGNO || this.m_markerType === MarkerType.VARSEGNO }
    isCoda(): boolean {
        return this.m_markerType === MarkerType.CODA || this.m_markerType === MarkerType.VARCODA || this.m_markerType === MarkerType.CODETTA
    }

    isToCoda(): boolean {
        return this.m_markerType === MarkerType.TOCODA || this.m_markerType === MarkerType.TOCODASYM
               || this.m_markerType === MarkerType.DA_CODA || this.m_markerType === MarkerType.DA_DBLCODA
    }

    isRightMarker(): boolean { return RIGHT_MARKERS.includes(this.m_markerType) }

    override subtype(): number { return this.m_markerType }

    measure(): Measure { return this.explicitParent() as unknown as Measure }

    label(): string { return this.m_label }
    setLabel(s: string): void { this.m_label = s }

    override positionRelativeToNoteheadRest(): boolean { return false }

    centerOnSymbol(): boolean { return this.m_centerOnSymbol }
    setCenterOnSymbol(val: boolean): void { this.m_centerOnSymbol = val }

    /** Returns the coda/segno symbol if present */
    symbolString(): string {
        for (const sym of REPEAT_SYMBOL_NAMES) {
            if (this.xmlText().includes(sym)) {
                return sym
            }
        }
        return ''
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.LABEL:
            return this.label()
        case Pid.MARKER_TYPE:
            return this.markerType()
        case Pid.MARKER_CENTER_ON_SYMBOL:
            return this.centerOnSymbol()
        default:
            break
        }
        return super.getProperty(propertyId)
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.LABEL:
            this.setLabel(v as string)
            break
        case Pid.MARKER_TYPE:
            this.setMarkerType(v as MarkerType)
            break
        case Pid.MARKER_CENTER_ON_SYMBOL:
            this.setCenterOnSymbol(v as boolean)
            break
        default:
            if (!super.setProperty(propertyId, v)) {
                return false
            }
            break
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.LABEL:
            for (const p of markerTypeTable) {
                if (this.m_markerType === p.type) {
                    return p.label
                }
            }
            return ''
        case Pid.MARKER_TYPE:
            return MarkerType.FINE
        case Pid.PLACEMENT:
            return PlacementV.ABOVE
        case Pid.MARKER_CENTER_ON_SYMBOL:
            return true
        case Pid.MUSIC_SYMBOL_SIZE:
            return 18.0
        default:
            break
        }
        return super.propertyDefault(propertyId)
    }

    markerTypeUserName(): string {
        return TConv.translatedUserNameMarkerType(this.markerType())
    }

    override subtypeUserName(): TranslatableString {
        return TConv.userNameMarkerType(this.markerType())
    }

    override accessibleInfo(): string {
        return `${this.translatedTypeUserName()}: ${this.markerTypeUserName()}`
    }
}
