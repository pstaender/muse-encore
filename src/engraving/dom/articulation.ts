/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/articulation.h/.cpp
 *
 * TODO(port): articulation texts (ArticulationTextType), split/join/flip helpers, playback names
 */

import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { SymNames } from '../types/symnames'
import { ArticulationTextType, DirectionV, ElementType, OrnamentStyle, PlacementV, type staff_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Chord } from './chord'
import type { ChordRest } from './chordrest'
import type { Measure } from './measure'
import type { Page } from './page'
import type { Segment } from './segment'
import type { System } from './system'
import type { Text } from './text'
import type { TranslatableString } from '../../framework/global/types/translatablestring'
import { TConv } from '../types/typesconv'

export enum ArticulationCategory {
    NONE = 0x0,
    DOUBLE = 0x1,
    TENUTO = 0x2,
    STACCATO = 0x4,
    ACCENT = 0x8,
    MARCATO = 0x10,
    LUTE_FINGERING = 0x20,
    LAISSEZ_VIB = 0x40,
    HANDBELLS = 0x80,
}

export enum ArticulationAnchor {
    TOP, // attribute is always placed at top
    BOTTOM, // attribute is placed at bottom
    AUTO, // anchor depends on chord direction, away from stem
}

export enum ArticulationStemSideAlign {
    STEM, // attribute is placed directly over the stem
    NOTEHEAD, // attribute is centered on the notehead
    AVERAGE, // attribute is placed at the average of stem pos and notehead center
}

export enum ArticulationShowIn {
    PITCHED_STAFF = 1, TABLATURE = 2,
}

enum AnchorGroup {
    ARTICULATION,
    LUTE_FINGERING,
    OTHER,
}

const articulationStyle: ElementStyle = [
    { sid: Sid.articulationMinDistance, pid: Pid.MIN_DISTANCE },
    { sid: Sid.articulationAnchorDefault, pid: Pid.ARTICULATION_ANCHOR },
]

const ARTICULATION_ANCHOR_GROUP = new Set<SymId>([
    SymId.articAccentAbove, SymId.articAccentBelow, SymId.articStaccatoAbove, SymId.articStaccatoBelow,
    SymId.articStaccatissimoAbove, SymId.articStaccatissimoBelow, SymId.articTenutoAbove, SymId.articTenutoBelow,
    SymId.articTenutoStaccatoAbove, SymId.articTenutoStaccatoBelow, SymId.articMarcatoAbove, SymId.articMarcatoBelow,
    SymId.articAccentStaccatoAbove, SymId.articAccentStaccatoBelow, SymId.articLaissezVibrerAbove,
    SymId.articLaissezVibrerBelow, SymId.articMarcatoStaccatoAbove, SymId.articMarcatoStaccatoBelow,
    SymId.articMarcatoTenutoAbove, SymId.articMarcatoTenutoBelow, SymId.articStaccatissimoStrokeAbove,
    SymId.articStaccatissimoStrokeBelow, SymId.articStaccatissimoWedgeAbove, SymId.articStaccatissimoWedgeBelow,
    SymId.articStressAbove, SymId.articStressBelow, SymId.articTenutoAccentAbove, SymId.articTenutoAccentBelow,
    SymId.articUnstressAbove, SymId.articUnstressBelow, SymId.articSoftAccentAbove, SymId.articSoftAccentBelow,
    SymId.articSoftAccentStaccatoAbove, SymId.articSoftAccentStaccatoBelow, SymId.articSoftAccentTenutoAbove,
    SymId.articSoftAccentTenutoBelow, SymId.articSoftAccentTenutoStaccatoAbove, SymId.articSoftAccentTenutoStaccatoBelow,
    SymId.wiggleSawtooth, SymId.wiggleSawtoothWide, SymId.wiggleVibratoLargeFaster, SymId.wiggleVibratoLargeSlowest,
    SymId.tremoloDivisiDots2, SymId.tremoloDivisiDots3, SymId.tremoloDivisiDots4, SymId.tremoloDivisiDots6,
])

const LUTE_FINGERING_ANCHOR_GROUP = new Set<SymId>([
    SymId.luteFingeringRHThumb, SymId.luteFingeringRHFirst, SymId.luteFingeringRHSecond, SymId.luteFingeringRHThird,
])

const BASIC_ARTICULATIONS = new Set<SymId>([
    SymId.articAccentAbove, SymId.articAccentBelow,
    SymId.articStaccatoAbove, SymId.articStaccatoBelow,
    SymId.articTenutoAbove, SymId.articTenutoBelow,
    SymId.articMarcatoAbove, SymId.articMarcatoBelow,
    SymId.articAccentStaccatoAbove, SymId.articAccentStaccatoBelow,
    SymId.articMarcatoStaccatoAbove, SymId.articMarcatoStaccatoBelow,
    SymId.articMarcatoTenutoAbove, SymId.articMarcatoTenutoBelow,
    SymId.articTenutoStaccatoAbove, SymId.articTenutoStaccatoBelow,
    SymId.articTenutoAccentAbove, SymId.articTenutoAccentBelow,
    SymId.articStaccatissimoAbove, SymId.articStaccatissimoBelow,
    SymId.articStaccatissimoStrokeAbove, SymId.articStaccatissimoStrokeBelow,
    SymId.articStaccatissimoWedgeAbove, SymId.articStaccatissimoWedgeBelow,
    SymId.articStressAbove, SymId.articStressBelow,
])

export class ArticulationLayoutData extends LayoutData {
    up = true
    symId: SymId = SymId.noSym

    override reset(): void {
        super.reset()
        this.up = true
        this.symId = SymId.noSym
    }

    opticalCenter(): number {
        const item = this.item()
        switch (this.symId) {
        case SymId.handbellsMartellatoLift:
            return 0.5 * item.symWidth(SymId.handbellsMartellato)
        case SymId.handbellsMalletLft:
            return 0.5 * item.symWidth(SymId.handbellsMalletBellOnTable)
        case SymId.handbellsPluckLift:
            return 0.5 * item.symWidth(SymId.articStaccatoAbove)
        default:
            return 0.5 * this.bbox().width()
        }
    }
}

export class Articulation extends EngravingItem {
    private m_categories = ArticulationCategory.NONE
    private m_symId: SymId = SymId.noSym
    private m_direction: DirectionV = DirectionV.AUTO
    private m_channelName = ''
    private m_textType = ArticulationTextType.NO_TEXT
    private m_text: Text | null = null
    private m_anchor = ArticulationAnchor.AUTO
    private m_ornamentStyle = OrnamentStyle.DEFAULT // for use in ornaments such as trill
    private m_playArticulation = true
    private m_showOnTabStyles: [Sid, Sid] = [Sid.NOSTYLE, Sid.NOSTYLE]

    constructor(parent: EngravingObject | null, type: ElementType = ElementType.ARTICULATION) {
        super(type, parent, ElementFlag.MOVABLE)
        this.initElementStyle(articulationStyle)
        this.setupShowOnTabStyles()
    }

    protected override createLayoutData(): ArticulationLayoutData { return new ArticulationLayoutData(this) }
    override ldata(): ArticulationLayoutData { return super.ldata() as ArticulationLayoutData }
    override mutldata(): ArticulationLayoutData { return super.ldata() as ArticulationLayoutData }

    override mag(): number {
        return this.explicitParent() ? this.parentItem()!.mag() * this.style().styleD(Sid.articulationMag) : 1.0
    }

    symId(): SymId { return this.m_symId }

    articulationName(): string {
        return Articulation.symId2ArticulationName(this.m_symId)
    }

    static symId2ArticulationName(symId: SymId): string {
        switch (symId) {
        case SymId.articStaccatissimoAbove:
        case SymId.articStaccatissimoBelow:
        case SymId.articStaccatissimoStrokeAbove:
        case SymId.articStaccatissimoStrokeBelow:
        case SymId.articStaccatissimoWedgeAbove:
        case SymId.articStaccatissimoWedgeBelow:
            return 'staccatissimo'

        case SymId.articStaccatoAbove:
        case SymId.articStaccatoBelow:
        case SymId.tremoloDivisiDots2:
        case SymId.tremoloDivisiDots3:
        case SymId.tremoloDivisiDots4:
        case SymId.tremoloDivisiDots6:
            return 'staccato'

        case SymId.articAccentStaccatoAbove:
        case SymId.articAccentStaccatoBelow:
            return 'sforzatoStaccato'

        case SymId.articMarcatoStaccatoAbove:
        case SymId.articMarcatoStaccatoBelow:
            return 'marcatoStaccato'

        case SymId.articTenutoStaccatoAbove:
        case SymId.articTenutoStaccatoBelow:
            return 'portato'

        case SymId.articTenutoAccentAbove:
        case SymId.articTenutoAccentBelow:
            return 'sforzatoTenuto'

        case SymId.articMarcatoTenutoAbove:
        case SymId.articMarcatoTenutoBelow:
            return 'marcatoTenuto'

        case SymId.articTenutoAbove:
        case SymId.articTenutoBelow:
            return 'tenuto'

        case SymId.articMarcatoAbove:
        case SymId.articMarcatoBelow:
            return 'marcato'

        case SymId.articAccentAbove:
        case SymId.articAccentBelow:
            return 'accent'

        case SymId.dynamicSforzato:
        case SymId.dynamicSforzando:
            return 'sforzato'

        case SymId.brassMuteOpen:
            return 'open'

        case SymId.brassMuteClosed:
            return 'closed'

        case SymId.stringsHarmonic:
            return 'harmonic'

        case SymId.ornamentMordent:
            return 'mordent'

        default:
            return '---'
        }
    }

    setSymId(id: SymId): void {
        this.m_symId = id
        this.computeCategories()
        this.setupShowOnTabStyles()
        this.m_anchor = this.propertyDefault(Pid.ARTICULATION_ANCHOR) as ArticulationAnchor
        this.m_textType = ArticulationTextType.NO_TEXT
    }

    override subtype(): number {
        if (this.m_textType !== ArticulationTextType.NO_TEXT) {
            return this.m_textType
        }
        const s = SymNames.nameForSymId(this.m_symId)
        if (s.endsWith('Below')) {
            return SymNames.symIdByName(s.substring(0, s.length - 5) + 'Above')
        } else if (s.endsWith('Turned')) {
            return SymNames.symIdByName(s.substring(0, s.length - 6))
        }
        return this.m_symId
    }

    setTextType(textType: ArticulationTextType): void { this.m_textType = textType }
    textType(): ArticulationTextType { return this.m_textType }
    text(): Text | null { return this.m_text }
    setText(t: Text | null): void { this.m_text = t }

    override setVisible(f: boolean): void {
        if (this.m_text) {
            this.m_text.setVisible(f)
        }
        super.setVisible(f)
    }

    setUp(val: boolean): void {
        const ldata = this.mutldata()
        ldata.up = val
        const dup = this.m_direction === DirectionV.AUTO ? val : this.m_direction === DirectionV.UP
        const s = SymNames.nameForSymId(this.m_symId)
        if (s.endsWith(!dup ? 'Above' : 'Below')) {
            const s2 = s.substring(0, s.length - 5) + (dup ? 'Above' : 'Below')
            this.m_symId = SymNames.symIdByName(s2)
        } else if (s.endsWith('Turned')) {
            const s2 = dup ? s.substring(0, s.length - 6) : s
            this.m_symId = SymNames.symIdByName(s2)
        } else if (!dup) {
            const sym = SymNames.symIdByName(s + 'Turned')
            if (sym !== SymId.noSym) {
                this.m_symId = sym
            }
        }
        ldata.symId = this.m_symId
    }

    up(): boolean { return this.ldata().up }

    setDirection(d: DirectionV): void { this.m_direction = d }
    direction(): DirectionV { return this.m_direction }

    chordRest(): ChordRest | null {
        const p = this.explicitParent()
        return p && p.isChordRest() ? p as unknown as ChordRest : null
    }

    segment(): Segment | null {
        const cr = this.chordRest()
        if (!cr) {
            return null
        }
        if (cr.isGrace()) {
            return cr.explicitParent() ? cr.explicitParent()!.explicitParent() as unknown as Segment : null
        }
        return cr.explicitParent() as unknown as Segment
    }

    measure(): Measure | null {
        const s = this.segment()
        return s ? s.explicitParent() as unknown as Measure : null
    }

    system(): System | null {
        const m = this.measure()
        return m ? m.explicitParent() as unknown as System : null
    }

    page(): Page | null {
        const s = this.system()
        return s ? s.explicitParent() as unknown as Page : null
    }

    anchor(): ArticulationAnchor { return this.m_anchor }
    setAnchor(v: ArticulationAnchor): void { this.m_anchor = v }
    ornamentStyle(): OrnamentStyle { return this.m_ornamentStyle }
    setOrnamentStyle(val: OrnamentStyle): void { this.m_ornamentStyle = val }
    playArticulation(): boolean { return this.m_playArticulation }
    setPlayArticulation(val: boolean): void { this.m_playArticulation = val }
    channelName(): string { return this.m_channelName }
    setChannelName(s: string): void { this.m_channelName = s }

    isDouble(): boolean { return (this.m_categories & ArticulationCategory.DOUBLE) !== 0 }
    isTenuto(): boolean { return (this.m_categories & ArticulationCategory.TENUTO) !== 0 }
    isStaccato(): boolean { return (this.m_categories & ArticulationCategory.STACCATO) !== 0 }
    isAccent(): boolean { return (this.m_categories & ArticulationCategory.ACCENT) !== 0 }
    isMarcato(): boolean { return (this.m_categories & ArticulationCategory.MARCATO) !== 0 }
    isLuteFingering(): boolean { return (this.m_categories & ArticulationCategory.LUTE_FINGERING) !== 0 }
    // hides EngravingObject::isLaissezVib() as in C++
    override isLaissezVib(): boolean { return (this.m_categories & ArticulationCategory.LAISSEZ_VIB) !== 0 }
    isHandbellsArticulation(): boolean { return (this.m_categories & ArticulationCategory.HANDBELLS) !== 0 }
    isBasicArticulation(): boolean { return BASIC_ARTICULATIONS.has(this.subtype() as SymId) }

    isHiddenOnTabStaff(): boolean {
        if (this.m_showOnTabStyles[0] === Sid.NOSTYLE || this.m_showOnTabStyles[1] === Sid.NOSTYLE) {
            return false
        }
        const stType = this.staffType()
        if (!stType || !stType.isTabStaff()) {
            return false
        }
        return stType.isHiddenElementOnTab(this.m_showOnTabStyles[0], this.m_showOnTabStyles[1])
    }

    layoutCloseToNote(): boolean {
        const s = this.staff()
        if (s && s.staffType(this.tick()).isTabStaff() && this.isStaccato()) {
            return false
        }
        return (this.isStaccato() || this.isTenuto()) && !this.isDouble()
    }

    isOnCrossBeamSide(): boolean {
        const cr = this.chordRest()
        if (!cr || !cr.isChord()) {
            return false
        }
        const chord = cr as unknown as Chord
        return !!chord.beam() && (chord.beam()!.cross() || chord.staffMove() !== 0) && (this.up() === chord.up())
    }

    override vStaffIdx(): staff_idx_t {
        const cr = this.chordRest()
        return cr ? cr.vStaffIdx() : this.staffIdx()
    }

    private static anchorGroup(symId: SymId): AnchorGroup {
        if (ARTICULATION_ANCHOR_GROUP.has(symId)) {
            return AnchorGroup.ARTICULATION
        }
        if (LUTE_FINGERING_ANCHOR_GROUP.has(symId)) {
            return AnchorGroup.LUTE_FINGERING
        }
        return AnchorGroup.OTHER
    }

    private computeCategories(): void {
        const id = this.m_symId
        const S = SymId
        let c = ArticulationCategory.NONE
        const set = (f: ArticulationCategory, v: boolean): void => {
            if (v) {
                c |= f
            }
        }
        set(ArticulationCategory.DOUBLE,
            id === S.articMarcatoStaccatoAbove || id === S.articMarcatoStaccatoBelow
            || id === S.articTenutoStaccatoAbove || id === S.articTenutoStaccatoBelow
            || id === S.articAccentStaccatoAbove || id === S.articAccentStaccatoBelow
            || id === S.articMarcatoTenutoAbove || id === S.articMarcatoTenutoBelow
            || id === S.articTenutoAccentAbove || id === S.articTenutoAccentBelow)
        set(ArticulationCategory.TENUTO,
            id === S.articTenutoAbove || id === S.articTenutoBelow
            || id === S.articMarcatoTenutoAbove || id === S.articMarcatoTenutoBelow
            || id === S.articTenutoAccentAbove || id === S.articTenutoAccentBelow)
        set(ArticulationCategory.STACCATO,
            id === S.articStaccatoAbove || id === S.articStaccatoBelow
            || id === S.articMarcatoStaccatoAbove || id === S.articMarcatoStaccatoBelow
            || id === S.articTenutoStaccatoAbove || id === S.articTenutoStaccatoBelow
            || id === S.articAccentStaccatoAbove || id === S.articAccentStaccatoBelow
            || id === S.tremoloDivisiDots2 || id === S.tremoloDivisiDots3
            || id === S.tremoloDivisiDots4 || id === S.tremoloDivisiDots6)
        set(ArticulationCategory.ACCENT,
            id === S.articAccentAbove || id === S.articAccentBelow
            || id === S.articAccentStaccatoAbove || id === S.articAccentStaccatoBelow)
        set(ArticulationCategory.MARCATO,
            id === S.articMarcatoAbove || id === S.articMarcatoBelow
            || id === S.articMarcatoStaccatoAbove || id === S.articMarcatoStaccatoBelow
            || id === S.articMarcatoTenutoAbove || id === S.articMarcatoTenutoBelow)
        set(ArticulationCategory.LUTE_FINGERING,
            id === S.stringsThumbPosition || id === S.luteFingeringRHThumb
            || id === S.luteFingeringRHFirst || id === S.luteFingeringRHSecond
            || id === S.luteFingeringRHThird)
        set(ArticulationCategory.LAISSEZ_VIB, id === S.articLaissezVibrerAbove || id === S.articLaissezVibrerBelow)
        set(ArticulationCategory.HANDBELLS,
            (id >= S.handbellsBelltree && id <= S.handbellsTableSingleBell)
            || (this.m_textType >= ArticulationTextType.TD && this.m_textType <= ArticulationTextType.VIB))
        this.m_categories = c
    }

    private setupShowOnTabStyles(): void {
        if (this.isStaccato()) {
            this.m_showOnTabStyles = [Sid.staccatoShowTabCommon, Sid.staccatoShowTabSimple]
        }
        if (this.isAccent() || this.isMarcato()) {
            this.m_showOnTabStyles = [Sid.accentShowTabCommon, Sid.accentShowTabSimple]
        }
        if (this.m_symId === SymId.ornamentTurn || this.m_symId === SymId.ornamentTurnInverted) {
            this.m_showOnTabStyles = [Sid.turnShowTabCommon, Sid.turnShowTabSimple]
        }
        if (this.m_symId === SymId.ornamentMordent || this.m_symId === SymId.ornamentShortTrill) {
            this.m_showOnTabStyles = [Sid.mordentShowTabCommon, Sid.mordentShowTabSimple]
        }
        if (this.m_symId === SymId.brassMuteOpen || this.m_symId === SymId.brassMuteClosed) {
            this.m_showOnTabStyles = [Sid.wahShowTabCommon, Sid.wahShowTabSimple]
        }
        if (this.m_symId === SymId.guitarGolpe) {
            this.m_showOnTabStyles = [Sid.golpeShowTabCommon, Sid.golpeShowTabSimple]
        }
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SYMBOL: return this.m_symId
        case Pid.DIRECTION: return this.direction()
        case Pid.ARTICULATION_ANCHOR: return this.anchor()
        case Pid.ORNAMENT_STYLE: return this.ornamentStyle()
        case Pid.PLAY: return this.playArticulation()
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.SYMBOL:
            this.setSymId(v as SymId)
            break
        case Pid.DIRECTION:
            this.setDirection(v as DirectionV)
            break
        case Pid.ARTICULATION_ANCHOR:
            this.setAnchor(v as ArticulationAnchor)
            break
        case Pid.PLAY:
            this.setPlayArticulation(!!v)
            break
        case Pid.ORNAMENT_STYLE:
            this.setOrnamentStyle(v as OrnamentStyle)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.DIRECTION: return DirectionV.AUTO
        case Pid.ORNAMENT_STYLE: return OrnamentStyle.DEFAULT
        case Pid.PLAY: return true
        default: return super.propertyDefault(propertyId)
        }
    }

    override getPropertyStyle(id: Pid): Sid {
        switch (id) {
        case Pid.MIN_DISTANCE:
            return super.getPropertyStyle(id)
        case Pid.ARTICULATION_ANCHOR: {
            if (this.isHandbellsArticulation()) {
                return Sid.articulationAnchorDefault
            }
            switch (Articulation.anchorGroup(this.m_symId)) {
            case AnchorGroup.ARTICULATION: return Sid.articulationAnchorDefault
            case AnchorGroup.LUTE_FINGERING: return Sid.articulationAnchorLuteFingering
            case AnchorGroup.OTHER: return Sid.articulationAnchorOther
            }
            return Sid.NOSTYLE
        }
        default:
            return Sid.NOSTYLE
        }
    }

    override resetProperty(id: Pid): void {
        switch (id) {
        case Pid.DIRECTION:
        case Pid.ORNAMENT_STYLE:
        case Pid.ARTICULATION_ANCHOR:
            this.setProperty(id, this.propertyDefault(id))
            return
        default:
            break
        }
        super.resetProperty(id)
    }

    override styleChanged(): void {
        if (this.m_text) {
            this.m_text.styleChanged()
        }
        const isGolpeThumb = this.m_symId === SymId.guitarGolpe && this.m_anchor === ArticulationAnchor.BOTTOM
        super.styleChanged()
        if (isGolpeThumb) {
            this.setAnchor(ArticulationAnchor.BOTTOM)
        }
    }

    override subtypeUserName(): TranslatableString {
        if (this.textType() !== ArticulationTextType.NO_TEXT) {
            return TConv.userNameArticulationTextType(this.textType())
        }

        return SymNames.userNameForSymId(this.symId())
    }

    override accessibleInfo(): string {
        return `${this.translatedTypeUserName()}: ${this.translatedSubtypeUserName()}`
    }
}

// ---- articulation.cpp: splitting and flipping of articulation symbols (note input, toggling articulations) ----

export enum ArticulationsUpdateMode {
    Insert,
    Remove,
}

const ARTICULATION_PLACEMENTS: readonly [SymId, SymId][] = [
    [SymId.articStaccatissimoAbove, SymId.articStaccatissimoBelow],
    [SymId.articStaccatissimoStrokeAbove, SymId.articStaccatissimoStrokeBelow],
    [SymId.articStaccatissimoWedgeAbove, SymId.articStaccatissimoWedgeBelow],
    [SymId.articStaccatoAbove, SymId.articStaccatoBelow],
    [SymId.articAccentStaccatoAbove, SymId.articAccentStaccatoBelow],
    [SymId.articMarcatoStaccatoAbove, SymId.articMarcatoStaccatoBelow],
    [SymId.articTenutoStaccatoAbove, SymId.articTenutoStaccatoBelow],
    [SymId.articTenutoAccentAbove, SymId.articTenutoAccentBelow],
    [SymId.articMarcatoTenutoAbove, SymId.articMarcatoTenutoBelow],
    [SymId.articTenutoAbove, SymId.articTenutoBelow],
    [SymId.articMarcatoAbove, SymId.articMarcatoBelow],
    [SymId.articAccentAbove, SymId.articAccentBelow],
]

/** ARTICULATION_ABOVE_SPLIT_GROUPS / ARTICULATION_BELOW_SPLIT_GROUP */
const ARTICULATION_SPLIT_GROUPS: ReadonlyMap<SymId, readonly [SymId, SymId]> = new Map<SymId, readonly [SymId, SymId]>([
    [SymId.articAccentStaccatoAbove, [SymId.articStaccatoAbove, SymId.articAccentAbove]],
    [SymId.articTenutoAccentAbove, [SymId.articTenutoAbove, SymId.articAccentAbove]],
    [SymId.articTenutoStaccatoAbove, [SymId.articTenutoAbove, SymId.articStaccatoAbove]],
    [SymId.articMarcatoStaccatoAbove, [SymId.articStaccatoAbove, SymId.articMarcatoAbove]],
    [SymId.articMarcatoTenutoAbove, [SymId.articTenutoAbove, SymId.articMarcatoAbove]],
    [SymId.articAccentStaccatoBelow, [SymId.articStaccatoBelow, SymId.articAccentBelow]],
    [SymId.articTenutoAccentBelow, [SymId.articTenutoBelow, SymId.articAccentBelow]],
    [SymId.articTenutoStaccatoBelow, [SymId.articTenutoBelow, SymId.articStaccatoBelow]],
    [SymId.articMarcatoStaccatoBelow, [SymId.articStaccatoBelow, SymId.articMarcatoBelow]],
    [SymId.articMarcatoTenutoBelow, [SymId.articTenutoBelow, SymId.articMarcatoBelow]],
])

/** C++ splitArticulations(): the combined articulations as their single symbols */
export function splitArticulations(articulationSymbolIds: Iterable<SymId>): Set<SymId> {
    const result = new Set<SymId>()
    for (const id of articulationSymbolIds) {
        const group = ARTICULATION_SPLIT_GROUPS.get(id)
        if (group) {
            result.add(group[0])
            result.add(group[1])
        } else {
            result.add(id)
        }
    }
    return result
}

/** C++ flipArticulations() */
export function flipArticulations(articulationSymbolIds: Iterable<SymId>, placement: PlacementV): Set<SymId> {
    const result = new Set<SymId>()
    for (const id of articulationSymbolIds) {
        const pair = placement === PlacementV.ABOVE
            ? ARTICULATION_PLACEMENTS.find(p => p[1] === id)?.[0]
            : ARTICULATION_PLACEMENTS.find(p => p[0] === id)?.[1]
        result.add(pair ?? id)
    }
    return result
}

/**
 * C++ updateArticulations(const std::set<SymId>&, SymId, ArticulationsUpdateMode) (the free function of
 * articulation.cpp): the articulations of the note input state after toggling one of them
 */
export function updateArticulationIds(articulationSymbolIds: Iterable<SymId>, articulationSymbolId: SymId,
    updateMode: ArticulationsUpdateMode): Set<SymId> {
    const splittedArticulations = splitArticulations(articulationSymbolIds)

    const replaceOrToggle = (id: SymId, replaced: SymId | null): void => {
        if (replaced !== null && splittedArticulations.has(replaced)) {
            splittedArticulations.delete(replaced)
            splittedArticulations.add(id)
        } else if (splittedArticulations.has(id)) {
            if (updateMode === ArticulationsUpdateMode.Remove) {
                splittedArticulations.delete(id)
            }
        } else {
            splittedArticulations.add(id)
        }
    }

    switch (articulationSymbolId) {
    case SymId.articMarcatoAbove:
        replaceOrToggle(SymId.articMarcatoAbove, SymId.articAccentAbove)
        break
    case SymId.articAccentAbove:
        replaceOrToggle(SymId.articAccentAbove, SymId.articMarcatoAbove)
        break
    case SymId.articTenutoAbove:
        replaceOrToggle(SymId.articTenutoAbove, null)
        break
    case SymId.articStaccatoAbove:
        replaceOrToggle(SymId.articStaccatoAbove, null)
        break
    default:
        break
    }
    // we no longer want to join articulations when adding or removing individual ones. combined articulations can still
    // be added by the palette (which doesn't perform any of this splitting)
    return splittedArticulations
}
