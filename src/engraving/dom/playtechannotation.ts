/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/playtechannotation.h/.cpp
 *
 * TODO(port): reading/writing, layout and drawing in scores (only used by the palettes so far)
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, PlayingTechniqueType, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import { PLAY_TECH_TYPES } from '../types/typesconvdata'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import { StaffTextBase } from './stafftextbase'

const ANNOTATION_STYLE: ElementStyle = [
    { sid: Sid.staffTextPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.staffTextMinDistance, pid: Pid.MIN_DISTANCE },
]

export class PlayTechAnnotation extends StaffTextBase {
    private m_techniqueType: PlayingTechniqueType
    private m_playPlayTechAnnotation = true

    constructor(parent: EngravingObject | null, techniqueType = PlayingTechniqueType.Undefined, tid = TextStyleType.STAFF) {
        super(ElementType.PLAYTECH_ANNOTATION, parent, tid, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.m_techniqueType = techniqueType
        this.initElementStyle(ANNOTATION_STYLE)
    }

    techniqueType(): PlayingTechniqueType { return this.m_techniqueType }

    setTechniqueType(techniqueType: PlayingTechniqueType): void {
        this.m_techniqueType = techniqueType
        this.resetProperty(Pid.TEXT_STYLE)
    }

    playPlayTechAnnotation(): boolean { return this.m_playPlayTechAnnotation }
    setPlayPlayTechAnnotation(v: boolean): void { this.m_playPlayTechAnnotation = v }

    override subtypeUserName(): TranslatableString {
        return TranslatableString.from(PLAY_TECH_TYPES.find(i => i.type === this.m_techniqueType)?.tCapitalizedUserName)
    }

    isHandbellsSymbol(): boolean {
        return this.m_techniqueType >= PlayingTechniqueType.HandbellsSwing && this.m_techniqueType <= PlayingTechniqueType.HandbellsR
    }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.PLAY_TECH_TYPE:
            return this.m_techniqueType
        case Pid.PLAY:
            return this.m_playPlayTechAnnotation
        default:
            return super.getProperty(id)
        }
    }

    override setProperty(propertyId: Pid, val: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.PLAY_TECH_TYPE:
            this.setTechniqueType(val as PlayingTechniqueType)
            break
        case Pid.PLAY:
            this.setPlayPlayTechAnnotation(val as boolean)
            break
        default:
            if (!super.setProperty(propertyId, val)) {
                return false
            }
            break
        }
        // TODO(port): triggerLayout()
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.TEXT_STYLE:
            return this.isHandbellsSymbol() ? TextStyleType.ARTICULATION : TextStyleType.STAFF
        case Pid.PLAY_TECH_TYPE:
            return PlayingTechniqueType.Natural
        case Pid.PLAY:
            return true
        default:
            return super.propertyDefault(id)
        }
    }
}
