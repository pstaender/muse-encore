/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/tapping.h/.cpp (Tapping, TappingHalfSlur, TappingHalfSlurSegment, TappingText)
 */

import type { Color } from '../../framework/draw/types/color'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import { ElementType, LHTappingShowItems, TappingHand, TextStyleType } from '../types/types'
import { TConv } from '../types/typesconv'
import { Sid } from '../style/styledef'
import type { PaintOptions } from '../rendering/paintoptions'
import { Articulation } from './articulation'
import { ElementFlag, type EngravingItem } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Slur, SlurSegment } from './slur'
import type { System } from './system'
import { TextBase } from './textbase'

export class Tapping extends Articulation {
    private m_hand = TappingHand.INVALID
    private m_tappingText: TappingText | null = null
    private m_halfSlurAbove: TappingHalfSlur | null = null
    private m_halfSlurBelow: TappingHalfSlur | null = null

    constructor(parent: EngravingObject | null) {
        super(parent, ElementType.TAPPING)
    }

    /** C++ copy constructor: only the hand is copied (the text and the half slurs are created by the layout) */
    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_tappingText = null
        this.m_halfSlurAbove = null
        this.m_halfSlurBelow = null
    }

    hand(): TappingHand { return this.m_hand }
    setHand(h: TappingHand): void { this.m_hand = h }

    /** C++ Tapping::text() (hides Articulation::text(): renamed) */
    tappingText(): TappingText | null { return this.m_tappingText }
    setTappingText(text: TappingText | null): void { this.m_tappingText = text }

    override setSelected(f: boolean): void {
        if (this.m_tappingText) {
            this.m_tappingText.setSelected(f)
        }
        if (this.m_halfSlurAbove) {
            this.m_halfSlurAbove.setSelected(f)
        }
        if (this.m_halfSlurBelow) {
            this.m_halfSlurBelow.setSelected(f)
        }

        super.setSelected(f)
    }

    halfSlurAbove(): TappingHalfSlur | null { return this.m_halfSlurAbove }
    setHalfSlurAbove(s: TappingHalfSlur | null): void { this.m_halfSlurAbove = s }
    halfSlurBelow(): TappingHalfSlur | null { return this.m_halfSlurBelow }
    setHalfSlurBelow(s: TappingHalfSlur | null): void { this.m_halfSlurBelow = s }

    lhShowItems(): LHTappingShowItems {
        // C++ DO_ASSERT(m_hand == TappingHand::LEFT)
        const s = this.style()
        const tabStaff = this.staffType()!.isTabStaff()

        return s.styleV(tabStaff ? Sid.lhTappingShowItemsTab : Sid.lhTappingShowItemsNormalStave) as LHTappingShowItems
    }

    override styleChanged(): void {
        if (this.m_tappingText) {
            this.m_tappingText.styleChanged()
        }
        super.styleChanged()
    }

    override mag(): number {
        return this.ldata().mag() * super.mag()
    }

    override subtype(): number {
        return this.m_hand
    }

    override accessibleInfo(): string {
        return `${this.subtypeUserName().translated()} ${TConv.capitalizedUserNameElementType(ElementType.TAPPING).translated()}`
    }

    override subtypeUserName(): TranslatableString {
        return this.m_hand === TappingHand.LEFT ? new TranslatableString('engraving', 'Left-hand')
            : new TranslatableString('engraving', 'Right-hand')
    }
}

export class TappingHalfSlurSegment extends SlurSegment {
    constructor(parent: System | null) {
        super(parent, ElementType.TAPPING_HALF_SLUR_SEGMENT)
    }

    tappingHalfSlur(): TappingHalfSlur { return this.spanner() as unknown as TappingHalfSlur }
}

export class TappingHalfSlur extends Slur {
    private m_isHalfSlurAbove = true

    constructor(parent: EngravingObject | null) {
        super(parent, ElementType.TAPPING_HALF_SLUR)
    }

    isHalfSlurAbove(): boolean { return this.m_isHalfSlurAbove }
    setIsHalfSlurAbove(v: boolean): void { this.m_isHalfSlurAbove = v }

    override newSlurTieSegment(parent: System | null): TappingHalfSlurSegment { return new TappingHalfSlurSegment(parent) }

    tapping(): Tapping { return this.parent() as unknown as Tapping }
}

const tapTextStyle: ElementStyle = []

export class TappingText extends TextBase {
    constructor(parent: Tapping | null) {
        super(ElementType.TAPPING_TEXT, parent, TextStyleType.HAMMER_ON_PULL_OFF,
            ElementFlag.MOVABLE | ElementFlag.GENERATED | ElementFlag.ON_STAFF)
        this.initElementStyle(tapTextStyle)
    }

    override curColor(opt: PaintOptions = {}): Color {
        const p: EngravingItem | null = this.parentItem()
        if (p) {
            return p.curColor(opt)
        }

        return super.curColor(opt)
    }

    override positionRelativeToNoteheadRest(): boolean { return true }
}
