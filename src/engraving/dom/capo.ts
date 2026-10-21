/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/capo.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { CapoParams, CapoTransposeMode, ElementType, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { arg, mtrc } from '../../framework/global/translation'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import { StaffTextBase } from './stafftextbase'

const CAPO_STYLE: ElementStyle = [
    { sid: Sid.staffTextPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.staffTextMinDistance, pid: Pid.MIN_DISTANCE },
]

export class Capo extends StaffTextBase {
    private m_params = new CapoParams()
    private m_shouldAutomaticallyGenerateText = true
    private m_customText = ''

    constructor(parent: EngravingObject | null, textStyleType: TextStyleType = TextStyleType.STAFF) {
        super(ElementType.CAPO, parent, textStyleType, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.initElementStyle(CAPO_STYLE)

        this.m_params.active = true
        this.m_params.fretPosition = 1
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_params = original.m_params.clone()
    }

    override getProperty(id: Pid): PropertyValue {
        if (id === Pid.ACTIVE) {
            return this.m_params.active
        } else if (id === Pid.CAPO_FRET_POSITION) {
            return this.m_params.fretPosition
        } else if (id === Pid.CAPO_IGNORED_STRINGS) {
            return [...this.m_params.ignoredStrings]
        } else if (id === Pid.CAPO_GENERATE_TEXT) {
            return this.m_shouldAutomaticallyGenerateText
        } else if (id === Pid.CAPO_TRANSPOSE_MODE) {
            return this.m_params.transposeMode
        }

        return super.getProperty(id)
    }

    override propertyDefault(id: Pid): PropertyValue {
        if (id === Pid.ACTIVE) {
            return true
        } else if (id === Pid.CAPO_FRET_POSITION) {
            return 1
        } else if (id === Pid.CAPO_IGNORED_STRINGS) {
            return []
        } else if (id === Pid.CAPO_GENERATE_TEXT) {
            return true
        } else if (id === Pid.CAPO_TRANSPOSE_MODE) {
            return CapoTransposeMode.PLAYBACK_ONLY
        }

        return super.propertyDefault(id)
    }

    override setProperty(id: Pid, val: PropertyValue): boolean {
        if (id === Pid.ACTIVE) {
            this.m_params.active = val as boolean
        } else if (id === Pid.CAPO_FRET_POSITION) {
            this.m_params.fretPosition = val as number
        } else if (id === Pid.CAPO_IGNORED_STRINGS) {
            this.m_params.ignoredStrings.clear()
            for (const string of val as number[]) {
                this.m_params.ignoredStrings.add(string)
            }
        } else if (id === Pid.CAPO_GENERATE_TEXT) {
            this.m_shouldAutomaticallyGenerateText = val as boolean

            if (!this.m_shouldAutomaticallyGenerateText) {
                this.setXmlText(this.m_customText)
            }
        } else if (id === Pid.CAPO_TRANSPOSE_MODE) {
            this.m_params.transposeMode = val as CapoTransposeMode
        } else {
            return super.setProperty(id, val)
        }

        this.triggerLayout()
        return true
    }

    override setXmlText(text: string): void {
        if (!this.m_shouldAutomaticallyGenerateText) {
            this.m_customText = text
        }

        super.setXmlText(text)
    }

    override isEditable(): boolean { return false }

    params(): CapoParams { return this.m_params }
    setParams(params: CapoParams): void { this.m_params = params }

    shouldAutomaticallyGenerateText(): boolean { return this.m_shouldAutomaticallyGenerateText }

    generateText(stringCount: number): string {
        if (!this.m_params.active || this.m_params.fretPosition === 0) {
            return mtrc('engraving', 'No capo')
        }

        if (this.m_params.ignoredStrings.size === 0) {
            return arg(mtrc('engraving', 'Capo %1'), this.m_params.fretPosition)
        }

        const stringsToApply: string[] = []

        for (let idx = 0; idx < stringCount; ++idx) {
            if (this.m_params.ignoredStrings.has(idx)) {
                continue
            }

            stringsToApply.push(String(idx + 1))
        }

        if (stringsToApply.length === 0) {
            return mtrc('engraving', 'No capo')
        }

        return arg(mtrc('engraving', 'Partial capo:\nFret %1 on strings %2'), this.m_params.fretPosition, stringsToApply.join(', '))
    }
}
