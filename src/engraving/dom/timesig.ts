/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/timesig.h/.cpp
 */

import { PointF, ScaleF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import type { SymId } from '../types/symid'
import { ElementType, PlacementV, TimeSigPlacement, TimeSigStyle } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import type { ElementStyle } from './engravingobject'
import { Groups, type GroupNodes } from './groups'
import { Pid } from './property'
import type { Segment } from './segment'
import type { Measure } from './measure'
import { TranslatableString } from '../../framework/global/types/translatablestring'

export enum TimeSigType {
    NORMAL, // use sz/sn text
    FOUR_FOUR, // common time (4/4)
    ALLA_BREVE, // cut time (2/2)
    CUT_BACH, // cut time (Bach)
    CUT_TRIPLE, // cut triple time (9/8)
}

const tsStyle: ElementStyle = [
    { sid: Sid.timeSigNormalScale, pid: Pid.SCALE },
]

export class TimeSigLayoutData extends LayoutData {
    ns: SymId[] = []
    ds: SymId[] = []
    pz = new PointF()
    pn = new PointF()
    pointLargeLeftParen = new PointF()
    pointLargeRightParen = new PointF()
}

export class TimeSig extends EngravingItem {
    private m_isCourtesy = false
    private m_numeratorString = '' // calculated from actualSig() if !customText
    private m_denominatorString = ''
    private m_sig = new Fraction(0, 1) // initialize to invalid
    private m_stretch = new Fraction(1, 1) // localSig / globalSig
    private m_groups = new Groups()
    private m_scale = new ScaleF(1.0, 1.0)
    private m_timeSigType = TimeSigType.NORMAL
    private m_showCourtesySig = true
    private m_largeParentheses = false

    constructor(parent: Segment | null) {
        super(ElementType.TIMESIG, parent, ElementFlag.ON_STAFF | ElementFlag.MOVABLE | ElementFlag.PLACE_ABOVE)
        this.initElementStyle(tsStyle)
        this.setMinDistance(new Spatium(0.5)) // TODO: style
    }

    protected override createLayoutData(): TimeSigLayoutData { return new TimeSigLayoutData(this) }
    override ldata(): TimeSigLayoutData { return super.ldata() as TimeSigLayoutData }
    override mutldata(): TimeSigLayoutData { return super.ldata() as TimeSigLayoutData }

    isCourtesy(): boolean { return this.m_isCourtesy }
    setIsCourtesy(v: boolean): void { this.m_isCourtesy = v }

    ssig(): string { return `${this.m_sig.numerator()}/${this.m_sig.denominator()}` }
    setSSig(s: string): void {
        const sl = s.split('/')
        if (sl.length === 2) {
            this.m_sig = new Fraction(parseInt(sl[0], 10), parseInt(sl[1], 10))
        }
    }

    timeSigType(): TimeSigType { return this.m_timeSigType }

    equals(ts: TimeSig): boolean {
        return this.timeSigType() === ts.timeSigType()
               && this.sig().identical(ts.sig())
               && this.stretch().eq(ts.stretch())
               && this.groups().equals(ts.groups())
               && this.m_numeratorString === ts.m_numeratorString
               && this.m_denominatorString === ts.m_denominatorString
    }

    override mag(): number {
        return this.timeSigPlacement() === TimeSigPlacement.NORMAL && this.staff() ? this.staff()!.staffMag(this) : 1.0
    }

    sig(): Fraction { return this.m_sig }
    setSig(f: Fraction, st: TimeSigType = TimeSigType.NORMAL): void {
        this.m_sig = f
        this.m_timeSigType = st
        this.m_largeParentheses = false
        this.m_numeratorString = ''
        this.m_denominatorString = ''
    }

    numerator(): number { return this.m_sig.numerator() }
    denominator(): number { return this.m_sig.denominator() }
    stretch(): Fraction { return this.m_stretch }
    setStretch(s: Fraction): void { this.m_stretch = s }
    numeratorStretch(): number { return this.m_stretch.numerator() }
    denominatorStretch(): number { return this.m_stretch.denominator() }

    segment(): Segment { return this.explicitParent() as unknown as Segment }
    measure(): Measure { return this.explicitParent()!.explicitParent() as unknown as Measure }

    showCourtesySig(): boolean { return this.m_showCourtesySig }
    setShowCourtesySig(v: boolean): void { this.m_showCourtesySig = v }

    numeratorString(): string { return this.m_numeratorString }
    setNumeratorString(a: string): void {
        if (this.m_timeSigType === TimeSigType.NORMAL) {
            this.m_numeratorString = a
        }
    }

    denominatorString(): string { return this.m_denominatorString }
    setDenominatorString(a: string): void {
        if (this.m_timeSigType === TimeSigType.NORMAL) {
            this.m_denominatorString = a
        }
    }

    largeParentheses(): boolean { return this.m_largeParentheses }
    setLargeParentheses(v: boolean): void { this.m_largeParentheses = v }

    setFrom(ts: TimeSig): void {
        this.m_timeSigType = ts.timeSigType()
        this.m_numeratorString = ts.m_numeratorString
        this.m_denominatorString = ts.m_denominatorString
        this.m_sig = ts.m_sig
        this.m_stretch = ts.m_stretch
    }

    groups(): Groups { return this.m_groups }
    setGroups(e: Groups): void { this.m_groups = e.clone() }
    isLocal(): boolean { return !this.m_stretch.eq(new Fraction(1, 1)) }

    override staffOffset(): PointF {
        const seg = this.explicitParent() ? this.segment() : null
        const meas = seg ? seg.measure() : null
        const tsTick = meas ? meas.tick() : this.tick()
        const st = this.staff()!.constStaffType(tsTick)
        const yOffset = st ? st.yoffset().val() * this.spatium() : 0.0
        return new PointF(0.0, yOffset)
    }

    override initElementStyle(ss: ElementStyle): void {
        super.initElementStyle(ss)
        this.m_scale = (this.propertyDefault(Pid.SCALE) as ScaleF).clone()
    }

    override styleChanged(): void {
        if (this.isStyled(Pid.SCALE)) {
            this.m_scale = (this.propertyDefault(Pid.SCALE) as ScaleF).clone()
        }
        super.styleChanged()
    }

    override getPropertyStyle(id: Pid): Sid {
        if (id === Pid.SCALE) {
            switch (this.timeSigPlacement()) {
            case TimeSigPlacement.NORMAL: return Sid.timeSigNormalScale
            case TimeSigPlacement.ABOVE_STAVES: return Sid.timeSigAboveScale
            case TimeSigPlacement.ACROSS_STAVES: return Sid.timeSigAcrossScale
            default: return Sid.NOSTYLE
            }
        }
        return super.getPropertyStyle(id)
    }

    showOnThisStaff(): boolean {
        return this.timeSigPlacement() === TimeSigPlacement.NORMAL || this.staffIdx() === 0 || this.staff()!.isSystemObjectStaff()
    }

    isAboveStaves(): boolean { return this.timeSigPlacement() === TimeSigPlacement.ABOVE_STAVES }
    isAcrossStaves(): boolean { return this.timeSigPlacement() === TimeSigPlacement.ACROSS_STAVES }

    timeSigPlacement(): TimeSigPlacement { return this.style().styleV(Sid.timeSigPlacement) as TimeSigPlacement }

    timeSigStyle(): TimeSigStyle {
        switch (this.timeSigPlacement()) {
        case TimeSigPlacement.NORMAL: return this.style().styleV(Sid.timeSigNormalStyle) as TimeSigStyle
        case TimeSigPlacement.ABOVE_STAVES: return this.style().styleV(Sid.timeSigAboveStyle) as TimeSigStyle
        case TimeSigPlacement.ACROSS_STAVES: return this.style().styleV(Sid.timeSigAcrossStyle) as TimeSigStyle
        default: return TimeSigStyle.NORMAL
        }
    }

    numDist(): number {
        switch (this.timeSigPlacement()) {
        case TimeSigPlacement.NORMAL: return this.style().styleMM(Sid.timeSigNormalNumDist)
        case TimeSigPlacement.ABOVE_STAVES: return this.style().styleMM(Sid.timeSigAboveNumDist)
        case TimeSigPlacement.ACROSS_STAVES: return this.style().styleMM(Sid.timeSigAcrossNumDist)
        default: return 0.0
        }
    }

    yPos(): number {
        switch (this.timeSigPlacement()) {
        case TimeSigPlacement.NORMAL: return this.style().styleMM(Sid.timeSigNormalY)
        case TimeSigPlacement.ABOVE_STAVES:
            return (this.staff()!.hasSystemObjectsBelowBottomStaff() ? -1.0 : 1.0) * this.style().styleMM(Sid.timeSigAboveY)
        case TimeSigPlacement.ACROSS_STAVES: return this.style().styleMM(Sid.timeSigAcrossY)
        default: return 0.0
        }
    }

    scale(): ScaleF { return this.m_scale }
    setScale(s: ScaleF): void { this.m_scale = s.clone() }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SHOW_COURTESY: return this.showCourtesySig()
        case Pid.NUMERATOR_STRING: return this.numeratorString()
        case Pid.DENOMINATOR_STRING: return this.denominatorString()
        case Pid.GROUP_NODES: return this.groups().nodes()
        case Pid.TIMESIG: return this.m_sig
        case Pid.TIMESIG_STRETCH: return this.stretch()
        case Pid.TIMESIG_TYPE: return this.m_timeSigType
        case Pid.SCALE: return this.m_scale
        case Pid.IS_COURTESY: return this.m_isCourtesy
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.SHOW_COURTESY:
            if (this.generated()) {
                return false
            }
            this.setShowCourtesySig(!!v)
            break
        case Pid.NUMERATOR_STRING:
            this.setNumeratorString(v as string)
            break
        case Pid.DENOMINATOR_STRING:
            this.setDenominatorString(v as string)
            break
        case Pid.GROUP_NODES:
            this.setGroups(new Groups(v as GroupNodes))
            break
        case Pid.TIMESIG:
            this.setSig(v as Fraction)
            break
        case Pid.TIMESIG_STRETCH:
            this.setStretch(v as Fraction)
            break
        case Pid.TIMESIG_TYPE:
            this.m_timeSigType = v as TimeSigType
            break
        case Pid.SCALE:
            this.m_scale = (v as ScaleF).clone()
            break
        case Pid.IS_COURTESY:
            this.m_isCourtesy = !!v
            break
        default:
            if (!super.setProperty(propertyId, v)) {
                return false
            }
            break
        }
        this.setGenerated(false)
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.SHOW_COURTESY: return true
        case Pid.NUMERATOR_STRING: return ''
        case Pid.DENOMINATOR_STRING: return ''
        case Pid.TIMESIG: return new Fraction(4, 4)
        case Pid.TIMESIG_TYPE: return TimeSigType.NORMAL
        case Pid.PLACEMENT: return PlacementV.ABOVE
        case Pid.IS_COURTESY: return false
        default: return super.propertyDefault(id)
        }
    }

    override subtypeUserName(): TranslatableString {
        switch (this.timeSigType()) {
        case TimeSigType.FOUR_FOUR:
            return new TranslatableString('engraving/timesig', 'Common time')
        case TimeSigType.ALLA_BREVE:
            return new TranslatableString('engraving/timesig', 'Cut time')
        case TimeSigType.CUT_BACH:
            return new TranslatableString('engraving/timesig', 'Cut time (Bach)')
        case TimeSigType.CUT_TRIPLE:
            return new TranslatableString('engraving/timesig', 'Cut triple time (9/8)')
        default:
            return new TranslatableString('engraving/timesig', '%1/%2 time').arg(this.numerator(), this.denominator())
        }
    }

    override accessibleInfo(): string {
        return `${this.translatedTypeUserName()}: ${this.translatedSubtypeUserName()}`
    }
}
