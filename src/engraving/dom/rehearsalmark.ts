/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/rehearsalmark.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid, PropertyFlags } from './property'
import type { Segment } from './segment'
import { TextBase } from './textbase'

export enum RehearsalMarkType {
    Main = 0,
    Additional,
}

const rehearsalMarkStyle: ElementStyle = [
    { sid: Sid.rehearsalMarkPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.rehearsalMarkMinDistance, pid: Pid.MIN_DISTANCE },
]

const mainRehearsalMarkStyle: ElementStyle = [
    { sid: Sid.rehearsalMarkFrameType, pid: Pid.FRAME_TYPE },
    { sid: Sid.rehearsalMarkFontSize, pid: Pid.FONT_SIZE },
    { sid: Sid.rehearsalMarkAlign, pid: Pid.ALIGN },
]

const additionalRehearsalMarkStyle: ElementStyle = [
    { sid: Sid.tempoFrameType, pid: Pid.FRAME_TYPE },
    { sid: Sid.tempoFontSize, pid: Pid.FONT_SIZE },
    { sid: Sid.tempoAlign, pid: Pid.ALIGN },
]

export class RehearsalMark extends TextBase {
    private m_markType = RehearsalMarkType.Main

    constructor(parent: EngravingObject | null) {
        super(ElementType.REHEARSAL_MARK, parent, TextStyleType.REHEARSAL_MARK, ElementFlag.ON_STAFF)
        this.initElementStyle(rehearsalMarkStyle)
        this.setSystemFlag(true)
    }

    segment(): Segment { return this.explicitParent() as unknown as Segment }

    override allowTimeAnchor(): boolean { return false }
    override positionRelativeToNoteheadRest(): boolean { return false }

    /** C++ RehearsalMark::type() (name clash with EngravingObject::type()) */
    markType(): RehearsalMarkType { return this.m_markType }

    setType(type: RehearsalMarkType): void {
        if (type === this.m_markType) {
            return
        }
        this.m_markType = type
        this.applyTypeStyle()
    }

    private applyTypeStyle(): void {
        const elemStyleMap = this.m_markType === RehearsalMarkType.Main ? mainRehearsalMarkStyle : additionalRehearsalMarkStyle
        for (const elem of elemStyleMap) {
            if (this.propertyFlags(elem.pid) === PropertyFlags.STYLED) {
                this.setProperty(elem.pid, this.style().styleV(elem.sid))
            }
        }
    }

    override styleChanged(): void {
        super.styleChanged()
        this.applyTypeStyle()
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.TEXT_STYLE:
            return TextStyleType.REHEARSAL_MARK
        case Pid.PLACEMENT:
            return this.style().styleV(Sid.rehearsalMarkPlacement)
        default:
            return super.propertyDefault(id)
        }
    }
}
