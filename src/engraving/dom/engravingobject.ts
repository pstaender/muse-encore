/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/engravingobject.h/.cpp
 *
 * Not ported: undo stack, linked objects (parts/excerpts), EIDs.
 */

import { PointF } from '../../framework/draw/types/geometry'
import { DPMM, ElementType } from '../types/types'
import { P_TYPE, propertyValueEquals, type PropertyValue } from '../types/propertyvalue'
import { TConv } from '../types/typesconv'
import type { TranslatableString } from '../../framework/global/types/translatablestring'
import { Sid } from '../style/styledef'
import type { MStyle } from '../style/style'
import { Pid, PropertyFlags, propertyType } from './property'
import type { Score } from './score'
import type { MasterScore } from './masterscore'
import type { EngravingItem } from './engravingitem'

export interface StyledProperty {
    sid: Sid
    pid: Pid
}

export type ElementStyle = readonly StyledProperty[]

const EMPTY_STYLE: ElementStyle = []

function cloneFieldValue(v: unknown): unknown {
    if (v === null || typeof v !== 'object') {
        return v
    }
    if (v instanceof EngravingObject) {
        return v
    }
    if (Array.isArray(v)) {
        return v.map(cloneFieldValue)
    }
    if (v instanceof Map) {
        return new Map(v)
    }
    if (v instanceof Set) {
        return new Set(v)
    }
    const c = (v as { clone?: () => unknown }).clone
    if (typeof c === 'function') {
        return c.call(v)
    }
    if (Object.getPrototypeOf(v) === Object.prototype) {
        return { ...(v as object) }
    }
    return v
}

export abstract class EngravingObject {
    protected m_elementStyle: ElementStyle = EMPTY_STYLE
    protected m_propertyFlagsList: PropertyFlags[] = []
    protected m_score: Score | null = null

    private m_type: ElementType
    private m_parent: EngravingObject | null = null
    private m_isParentExplicitlySet = false
    private m_children: EngravingObject[] = []
    private m_links: EngravingObject[] | null = null // shared list of linked objects (C++ LinkedObjects)

    constructor(type: ElementType, parent: EngravingObject | null) {
        this.m_type = type
        if (parent) {
            this.doSetParent(parent)
            this.doSetScore(parent.score())
        }
    }

    type(): ElementType { return this.m_type }
    isType(t: ElementType): boolean { return t === this.m_type }
    typeName(): string { return TConv.toXmlElementType(this.m_type) }
    typeUserName(): TranslatableString { return TConv.capitalizedUserNameElementType(this.m_type) }
    translatedTypeUserName(): string { return this.typeUserName().translated() }

    protected hack_setType(t: ElementType): void { this.m_type = t }

    // ---------------------------------------------------------------------------------
    // parent / children
    // ---------------------------------------------------------------------------------

    parent(): EngravingObject | null { return this.m_parent }

    explicitParent(): EngravingObject | null {
        return this.m_isParentExplicitlySet ? this.m_parent : null
    }

    setParent(p: EngravingObject | null): void {
        this.setParentInternal(p)
    }

    protected setParentInternal(p: EngravingObject | null): void {
        if (p === this) {
            return
        }
        if (!p) {
            this.doSetParent(null)
            this.m_isParentExplicitlySet = false
            return
        }
        this.doSetParent(p)
        if (this.m_parent) {
            this.doSetScore(this.m_parent.score())
        }
        this.m_isParentExplicitlySet = !p.isType(ElementType.DUMMY)
    }

    resetExplicitParent(): void {
        this.m_isParentExplicitlySet = false
    }

    moveToDummy(): void {
        // there is no dummy root in the port: the object is detached
        this.doSetParent(null)
        this.m_isParentExplicitlySet = false
    }

    children(): readonly EngravingObject[] { return this.m_children }

    // ---------------------------------------------------------------------------------
    // links (C++ LinkedObjects, without undo)
    // ---------------------------------------------------------------------------------

    links(): readonly EngravingObject[] | null { return this.m_links }
    /** C++ setLinks(LinkedObjects*): the list is shared, not copied */
    setLinks(le: EngravingObject[] | null): void { this.m_links = le }

    /** all linked objects, or only this object if it is not linked */
    linkList(): readonly EngravingObject[] { return this.m_links ?? [this] }

    /** return true if se is different and linked to this element (C++ mainElement() is the first linked object) */
    isLinked(se: EngravingObject | null = null): boolean {
        if (se === this || !this.m_links) {
            return false
        }
        if (se === null) {
            return this.m_links.length > 0 && this.m_links[0] !== this
        }
        return this.m_links.includes(se)
    }

    linkTo(other: EngravingObject): void {
        if (other.m_links) {
            if (!other.m_links.includes(this)) {
                other.m_links.push(this)
            }
            this.m_links = other.m_links
        } else {
            this.m_links = [other, this]
            other.m_links = this.m_links
        }
    }

    unlink(): void {
        if (!this.m_links) {
            return
        }
        const i = this.m_links.indexOf(this)
        if (i >= 0) {
            this.m_links.splice(i, 1)
        }
        if (this.m_links.length === 1) {
            this.m_links[0].m_links = null
        }
        this.m_links = null
    }

    undoUnlink(): void { this.unlink() }

    /**
     * Generic replacement for the C++ copy constructors: value fields are copied (objects with a clone() method are
     * cloned, arrays are copied), references to other engraving objects are shared, children and links are not copied.
     * Subclasses fix up their fields in onCloned().
     */
    protected cloneObject(): this {
        const c = Object.create(Object.getPrototypeOf(this)) as this
        for (const key of Object.keys(this)) {
            (c as unknown as Record<string, unknown>)[key] = cloneFieldValue((this as unknown as Record<string, unknown>)[key])
        }
        c.m_children = []
        c.m_links = null
        c.m_parent = null
        if (this.m_parent) {
            c.doSetParent(this.m_parent)
        }
        c.onCloned(this)
        return c
    }

    protected onCloned(_original: this): void {}

    protected addChild(o: EngravingObject): void {
        if (o === this) {
            return
        }
        this.m_children.push(o)
    }

    protected removeChild(o: EngravingObject): void {
        o.m_parent = null
        const i = this.m_children.indexOf(o)
        if (i >= 0) {
            this.m_children.splice(i, 1)
        }
    }

    private doSetParent(p: EngravingObject | null): void {
        if (this.m_parent === p) {
            return
        }
        if (p === this) {
            return
        }
        if (this.m_parent) {
            this.m_parent.removeChild(this)
        }
        this.m_parent = p
        if (this.m_parent) {
            this.m_parent.addChild(this)
        }
    }

    private doSetScore(sc: Score | null): void {
        if (this.m_score === sc) {
            return
        }
        this.m_score = sc
        for (const ch of this.m_children) {
            ch.doSetScore(sc)
        }
    }

    setScore(s: Score | null): void {
        this.doSetScore(s)
    }

    scanElements(_func: (item: EngravingItem) => void): void {}

    score(): Score { return this.m_score! }

    masterScore(): MasterScore { return this.score().masterScore() }

    onSameScore(other: EngravingObject): boolean { return this.score() === other.score() }

    style(): MStyle { return this.score().style() }

    isEngravingItem(): boolean { return false }

    // ---------------------------------------------------------------------------------
    // properties
    // ---------------------------------------------------------------------------------

    propertyDelegate(_pid: Pid): EngravingObject | null { return null }

    abstract getProperty(pid: Pid): PropertyValue
    abstract setProperty(pid: Pid, v: PropertyValue): boolean

    propertyDefault(pid: Pid): PropertyValue {
        const sid = this.getPropertyStyle(pid)
        if (sid !== Sid.NOSTYLE) {
            return this.styleValue(pid, sid)
        }
        return undefined
    }

    resetProperty(pid: Pid): void {
        const v = this.propertyDefault(pid)
        if (v !== undefined) {
            this.setProperty(pid, v)
            const p = this.propertyFlags(pid)
            if (p === PropertyFlags.UNSTYLED) {
                this.setPropertyFlags(pid, PropertyFlags.STYLED)
            }
        }
    }

    /**
     * Undo is not ported: the property is changed directly.
     * TODO(port): linked elements, Pid::TEXT_STYLE property lists
     */
    undoChangeProperty(id: Pid, v: PropertyValue, ps: PropertyFlags = this.propertyFlags(id)): void {
        if (this.propertyFlags(id) === ps && propertyValueEquals(this.getProperty(id), v)) {
            return
        }
        this.setProperty(id, v)
        this.setPropertyFlags(id, ps)
        if ((id === Pid.PLACEMENT || id === Pid.HAIRPIN_TYPE) && this.isStyled(Pid.OFFSET)) {
            const sp = this.isEngravingItem() ? (this as unknown as { spatium(): number }).spatium() : this.style().spatium()
            this.setProperty(Pid.OFFSET, (this.style().styleV(this.getPropertyStyle(Pid.OFFSET)) as PointF).times(sp))
            ;(this as unknown as { setOffsetChanged(v: boolean): void }).setOffsetChanged(false)
        }
    }

    undoResetProperty(id: Pid): void {
        let f = this.propertyFlags(id)
        if (f === PropertyFlags.UNSTYLED) {
            f = PropertyFlags.STYLED
        }
        const v = this.propertyDefault(id)
        if (v !== undefined) {
            this.undoChangeProperty(id, v, f)
        }
    }

    sizeIsSpatiumDependent(): boolean { return true }
    offsetIsSpatiumDependent(): boolean { return true }

    initElementStyle(ss: ElementStyle): void {
        this.m_elementStyle = ss
        this.m_propertyFlagsList = ss.map(() => PropertyFlags.STYLED)
        for (const spp of this.m_elementStyle) {
            this.setProperty(spp.pid, this.styleValue(spp.pid, this.getPropertyStyle(spp.pid)))
        }
    }

    styledProperties(): ElementStyle { return this.m_elementStyle }

    protected getPropertyFlagsIdx(id: Pid): number {
        return this.m_elementStyle.findIndex(p => p.pid === id)
    }

    propertyFlags(id: Pid): PropertyFlags {
        const e = this.propertyDelegate(id)
        if (e) {
            return e.propertyFlags(id)
        }
        const i = this.getPropertyFlagsIdx(id)
        if (i === -1) {
            return PropertyFlags.NOSTYLE
        }
        return this.m_propertyFlagsList[i]
    }

    setPropertyFlags(id: Pid, f: PropertyFlags): void {
        const e = this.propertyDelegate(id)
        if (e) {
            e.setPropertyFlags(id, f)
            return
        }
        const i = this.getPropertyFlagsIdx(id)
        if (i === -1) {
            return
        }
        this.m_propertyFlagsList[i] = f
    }

    isStyled(pid: Pid): boolean {
        return this.propertyFlags(pid) === PropertyFlags.STYLED
    }

    getPropertyStyle(id: Pid): Sid {
        for (const p of this.m_elementStyle) {
            if (p.pid === id) {
                return p.sid
            }
        }
        return Sid.NOSTYLE
    }

    styleChanged(): void {
        for (const spp of this.m_elementStyle) {
            if (this.propertyFlags(spp.pid) === PropertyFlags.STYLED) {
                this.setProperty(spp.pid, this.styleValue(spp.pid, this.getPropertyStyle(spp.pid)))
            }
        }
    }

    styleValue(pid: Pid, sid: Sid): PropertyValue {
        switch (propertyType(pid)) {
        case P_TYPE.MILLIMETRE:
            return this.style().styleMM(sid)
        case P_TYPE.POINT: {
            const v = this.style().styleV(sid) as PointF | undefined // undefined for Sid::NOSTYLE (C++: empty value)
            let val = v ? v.clone() : new PointF()
            if (this.offsetIsSpatiumDependent()) {
                val = val.times(this.style().spatium())
                if (this.isEngravingItem()) {
                    const e = this as unknown as EngravingItem
                    if (e.staff() && !e.systemFlag()) {
                        val = val.times(e.staff()!.staffMag(e.tick()))
                    }
                }
            } else {
                val = val.times(DPMM)
            }
            return val
        }
        default:
            return this.style().styleV(sid)
        }
    }

    // ---------------------------------------------------------------------------------
    // type checks (CONVERT macros)
    // ---------------------------------------------------------------------------------

    isNote(): boolean { return this.m_type === ElementType.NOTE }
    isRest(): boolean { return this.m_type === ElementType.REST }
    isMMRest(): boolean { return this.m_type === ElementType.MMREST }
    isDeadSlapped(): boolean { return this.m_type === ElementType.DEAD_SLAPPED }
    isChord(): boolean { return this.m_type === ElementType.CHORD }
    isBarLine(): boolean { return this.m_type === ElementType.BAR_LINE }
    isOrnament(): boolean { return this.m_type === ElementType.ORNAMENT }
    isFermata(): boolean { return this.m_type === ElementType.FERMATA }
    isMarker(): boolean { return this.m_type === ElementType.MARKER }
    isClef(): boolean { return this.m_type === ElementType.CLEF }
    isKeySig(): boolean { return this.m_type === ElementType.KEYSIG }
    isTimeSig(): boolean { return this.m_type === ElementType.TIMESIG }
    isMeasure(): boolean { return this.m_type === ElementType.MEASURE }
    isTempoText(): boolean { return this.m_type === ElementType.TEMPO_TEXT }
    isBreath(): boolean { return this.m_type === ElementType.BREATH }
    isHBox(): boolean { return this.m_type === ElementType.HBOX }
    isVBox(): boolean { return this.m_type === ElementType.VBOX }
    isTBox(): boolean { return this.m_type === ElementType.TBOX }
    isFBox(): boolean { return this.m_type === ElementType.FBOX }
    isGlissando(): boolean { return this.m_type === ElementType.GLISSANDO }
    isGlissandoSegment(): boolean { return this.m_type === ElementType.GLISSANDO_SEGMENT }
    isGuitarBend(): boolean { return this.m_type === ElementType.GUITAR_BEND }
    isGuitarBendSegment(): boolean { return this.m_type === ElementType.GUITAR_BEND_SEGMENT }
    isGuitarBendHold(): boolean { return this.m_type === ElementType.GUITAR_BEND_HOLD }
    isGuitarBendHoldSegment(): boolean { return this.m_type === ElementType.GUITAR_BEND_HOLD_SEGMENT }
    isGuitarBendText(): boolean { return this.m_type === ElementType.GUITAR_BEND_TEXT }
    isSystemDivider(): boolean { return this.m_type === ElementType.SYSTEM_DIVIDER }
    isRehearsalMark(): boolean { return this.m_type === ElementType.REHEARSAL_MARK }
    isTripletFeel(): boolean { return this.m_type === ElementType.TRIPLET_FEEL }
    isHarmony(): boolean { return this.m_type === ElementType.HARMONY }
    isVolta(): boolean { return this.m_type === ElementType.VOLTA }
    isJump(): boolean { return this.m_type === ElementType.JUMP }
    isOttava(): boolean { return this.m_type === ElementType.OTTAVA }
    isLayoutBreak(): boolean { return this.m_type === ElementType.LAYOUT_BREAK }
    isStaffVisibilityIndicator(): boolean { return this.m_type === ElementType.STAFF_VISIBILITY_INDICATOR }
    isSystemLockIndicator(): boolean { return this.m_type === ElementType.SYSTEM_LOCK_INDICATOR }
    isSegment(): boolean { return this.m_type === ElementType.SEGMENT }
    isSystem(): boolean { return this.m_type === ElementType.SYSTEM }
    isLyrics(): boolean { return this.m_type === ElementType.LYRICS }
    isStem(): boolean { return this.m_type === ElementType.STEM }
    isBeam(): boolean { return this.m_type === ElementType.BEAM }
    isHook(): boolean { return this.m_type === ElementType.HOOK }
    isStemSlash(): boolean { return this.m_type === ElementType.STEM_SLASH }
    isLaissezVibSegment(): boolean { return this.m_type === ElementType.LAISSEZ_VIB_SEGMENT }
    isLaissezVib(): boolean { return this.m_type === ElementType.LAISSEZ_VIB }
    isPartialTieSegment(): boolean { return this.m_type === ElementType.PARTIAL_TIE_SEGMENT }
    isPartialTie(): boolean { return this.m_type === ElementType.PARTIAL_TIE }
    isSpacer(): boolean { return this.m_type === ElementType.SPACER }
    isStaffLines(): boolean { return this.m_type === ElementType.STAFF_LINES }
    isAmbitus(): boolean { return this.m_type === ElementType.AMBITUS }
    isBracket(): boolean { return this.m_type === ElementType.BRACKET }
    isInstrumentChange(): boolean { return this.m_type === ElementType.INSTRUMENT_CHANGE }
    isStaffTypeChange(): boolean { return this.m_type === ElementType.STAFFTYPE_CHANGE }
    isHairpin(): boolean { return this.m_type === ElementType.HAIRPIN }
    isHairpinSegment(): boolean { return this.m_type === ElementType.HAIRPIN_SEGMENT }
    isBend(): boolean { return this.m_type === ElementType.BEND }
    isTremoloBar(): boolean { return this.m_type === ElementType.TREMOLOBAR }
    isMeasureRepeat(): boolean { return this.m_type === ElementType.MEASURE_REPEAT }
    isTuplet(): boolean { return this.m_type === ElementType.TUPLET }
    isNoteDot(): boolean { return this.m_type === ElementType.NOTEDOT }
    isDynamic(): boolean { return this.m_type === ElementType.DYNAMIC }
    isExpression(): boolean { return this.m_type === ElementType.EXPRESSION }
    isInstrumentName(): boolean { return this.m_type === ElementType.INSTRUMENT_NAME }
    isAccidental(): boolean { return this.m_type === ElementType.ACCIDENTAL }
    isTextLine(): boolean { return this.m_type === ElementType.TEXTLINE }
    isTextLineSegment(): boolean { return this.m_type === ElementType.TEXTLINE_SEGMENT }
    isPedal(): boolean { return this.m_type === ElementType.PEDAL }
    isPedalSegment(): boolean { return this.m_type === ElementType.PEDAL_SEGMENT }
    isOttavaSegment(): boolean { return this.m_type === ElementType.OTTAVA_SEGMENT }
    isLedgerLine(): boolean { return this.m_type === ElementType.LEDGER_LINE }
    isActionIcon(): boolean { return this.m_type === ElementType.ACTION_ICON }
    isVoltaSegment(): boolean { return this.m_type === ElementType.VOLTA_SEGMENT }
    isNoteLine(): boolean { return this.m_type === ElementType.NOTELINE }
    isNoteLineSegment(): boolean { return this.m_type === ElementType.NOTELINE_SEGMENT }
    isTrill(): boolean { return this.m_type === ElementType.TRILL }
    isTrillSegment(): boolean { return this.m_type === ElementType.TRILL_SEGMENT }
    isLetRing(): boolean { return this.m_type === ElementType.LET_RING }
    isLetRingSegment(): boolean { return this.m_type === ElementType.LET_RING_SEGMENT }
    isGradualTempoChange(): boolean { return this.m_type === ElementType.GRADUAL_TEMPO_CHANGE }
    isGradualTempoChangeSegment(): boolean { return this.m_type === ElementType.GRADUAL_TEMPO_CHANGE_SEGMENT }
    isVibrato(): boolean { return this.m_type === ElementType.VIBRATO }
    isPalmMute(): boolean { return this.m_type === ElementType.PALM_MUTE }
    isPalmMuteSegment(): boolean { return this.m_type === ElementType.PALM_MUTE_SEGMENT }
    isWhammyBar(): boolean { return this.m_type === ElementType.WHAMMY_BAR }
    isWhammyBarSegment(): boolean { return this.m_type === ElementType.WHAMMY_BAR_SEGMENT }
    isRasgueado(): boolean { return this.m_type === ElementType.RASGUEADO }
    isRasgueadoSegment(): boolean { return this.m_type === ElementType.RASGUEADO_SEGMENT }
    isHarmonicMark(): boolean { return this.m_type === ElementType.HARMONIC_MARK }
    isHarmonicMarkSegment(): boolean { return this.m_type === ElementType.HARMONIC_MARK_SEGMENT }
    isPickScrape(): boolean { return this.m_type === ElementType.PICK_SCRAPE }
    isPickScrapeSegment(): boolean { return this.m_type === ElementType.PICK_SCRAPE_SEGMENT }
    isVibratoSegment(): boolean { return this.m_type === ElementType.VIBRATO_SEGMENT }
    isSymbol(): boolean { return this.m_type === ElementType.SYMBOL }
    isFSymbol(): boolean { return this.m_type === ElementType.FSYMBOL }
    isFingering(): boolean { return this.m_type === ElementType.FINGERING }
    isNoteHead(): boolean { return this.m_type === ElementType.NOTEHEAD }
    isPartialLyricsLine(): boolean { return this.m_type === ElementType.PARTIAL_LYRICSLINE }
    isPartialLyricsLineSegment(): boolean { return this.m_type === ElementType.PARTIAL_LYRICSLINE_SEGMENT }
    isFiguredBass(): boolean { return this.m_type === ElementType.FIGURED_BASS }
    isFiguredBassItem(): boolean { return this.m_type === ElementType.FIGURED_BASS_ITEM }
    isStaffState(): boolean { return this.m_type === ElementType.STAFF_STATE }
    isArpeggio(): boolean { return this.m_type === ElementType.ARPEGGIO }
    isChordBracket(): boolean { return this.m_type === ElementType.CHORD_BRACKET }
    isImage(): boolean { return this.m_type === ElementType.IMAGE }
    isChordLine(): boolean { return this.m_type === ElementType.CHORDLINE }
    isFretDiagram(): boolean { return this.m_type === ElementType.FRET_DIAGRAM }
    isHarpPedalDiagram(): boolean { return this.m_type === ElementType.HARP_DIAGRAM }
    isPage(): boolean { return this.m_type === ElementType.PAGE }
    isText(): boolean { return this.m_type === ElementType.TEXT }
    isMeasureNumber(): boolean { return this.m_type === ElementType.MEASURE_NUMBER }
    isMMRestRange(): boolean { return this.m_type === ElementType.MMREST_RANGE }
    isStaffText(): boolean { return this.m_type === ElementType.STAFF_TEXT }
    isSystemText(): boolean { return this.m_type === ElementType.SYSTEM_TEXT }
    isSoundFlag(): boolean { return this.m_type === ElementType.SOUND_FLAG }
    isPlayCountText(): boolean { return this.m_type === ElementType.PLAY_COUNT_TEXT }
    isPlayTechAnnotation(): boolean { return this.m_type === ElementType.PLAYTECH_ANNOTATION }
    isCapo(): boolean { return this.m_type === ElementType.CAPO }
    isBracketItem(): boolean { return this.m_type === ElementType.BRACKET_ITEM }
    isScore(): boolean { return this.m_type === ElementType.SCORE }
    isStaff(): boolean { return this.m_type === ElementType.STAFF }
    isPart(): boolean { return this.m_type === ElementType.PART }
    isBagpipeEmbellishment(): boolean { return this.m_type === ElementType.BAGPIPE_EMBELLISHMENT }
    isLasso(): boolean { return this.m_type === ElementType.LASSO }
    isSticking(): boolean { return this.m_type === ElementType.STICKING }
    isGraceNotesGroup(): boolean { return this.m_type === ElementType.GRACE_NOTES_GROUP }
    isStringTunings(): boolean { return this.m_type === ElementType.STRING_TUNINGS }
    isTimeTickAnchor(): boolean { return this.m_type === ElementType.TIME_TICK_ANCHOR }
    isParenthesis(): boolean { return this.m_type === ElementType.PARENTHESIS }
    isShadowNote(): boolean { return this.m_type === ElementType.SHADOW_NOTE }
    isHammerOnPullOff(): boolean { return this.m_type === ElementType.HAMMER_ON_PULL_OFF }
    isHammerOnPullOffSegment(): boolean { return this.m_type === ElementType.HAMMER_ON_PULL_OFF_SEGMENT }
    isHammerOnPullOffText(): boolean { return this.m_type === ElementType.HAMMER_ON_PULL_OFF_TEXT }
    isTappingHalfSlur(): boolean { return this.m_type === ElementType.TAPPING_HALF_SLUR }
    isTappingHalfSlurSegment(): boolean { return this.m_type === ElementType.TAPPING_HALF_SLUR_SEGMENT }

    isRestFamily(): boolean { return this.isRest() || this.isMMRest() || this.isMeasureRepeat() }
    isChordRest(): boolean { return this.isRestFamily() || this.isChord() }
    isDurationElement(): boolean { return this.isChordRest() || this.isTuplet() }
    isSlurTie(): boolean { return this.isSlur() || this.isTie() }
    isSlurTieSegment(): boolean { return this.isSlurSegment() || this.isTieSegment() }
    isBox(): boolean { return this.isVBox() || this.isHBox() || this.isTBox() || this.isFBox() }
    isVBoxBase(): boolean { return this.isVBox() || this.isTBox() || this.isFBox() }
    isMeasureBase(): boolean { return this.isMeasure() || this.isBox() }

    isTextBase(): boolean {
        switch (this.m_type) {
        case ElementType.TEXT:
        case ElementType.LYRICS:
        case ElementType.DYNAMIC:
        case ElementType.EXPRESSION:
        case ElementType.FINGERING:
        case ElementType.HARMONY:
        case ElementType.MARKER:
        case ElementType.JUMP:
        case ElementType.STAFF_TEXT:
        case ElementType.SYSTEM_TEXT:
        case ElementType.TRIPLET_FEEL:
        case ElementType.PLAY_COUNT_TEXT:
        case ElementType.PLAYTECH_ANNOTATION:
        case ElementType.CAPO:
        case ElementType.STRING_TUNINGS:
        case ElementType.REHEARSAL_MARK:
        case ElementType.INSTRUMENT_CHANGE:
        case ElementType.FIGURED_BASS:
        case ElementType.TEMPO_TEXT:
        case ElementType.INSTRUMENT_NAME:
        case ElementType.MEASURE_NUMBER:
        case ElementType.MMREST_RANGE:
        case ElementType.STICKING:
        case ElementType.HARP_DIAGRAM:
        case ElementType.GUITAR_BEND_TEXT:
        case ElementType.HAMMER_ON_PULL_OFF_TEXT:
            return true
        default:
            return false
        }
    }

    isTextLineBaseSegment(): boolean {
        return this.isHairpinSegment()
               || this.isLetRingSegment()
               || this.isGradualTempoChangeSegment()
               || this.isTextLineSegment()
               || this.isOttavaSegment()
               || this.isPalmMuteSegment()
               || this.isPickScrapeSegment()
               || this.isWhammyBarSegment()
               || this.isRasgueadoSegment()
               || this.isHarmonicMarkSegment()
               || this.isPedalSegment()
               || this.isVoltaSegment()
               || this.isNoteLineSegment()
    }

    isSlur(): boolean {
        return this.m_type === ElementType.SLUR || this.m_type === ElementType.HAMMER_ON_PULL_OFF
               || this.m_type === ElementType.TAPPING_HALF_SLUR
    }

    isSlurSegment(): boolean {
        return this.m_type === ElementType.SLUR_SEGMENT || this.m_type === ElementType.HAMMER_ON_PULL_OFF_SEGMENT
               || this.m_type === ElementType.TAPPING_HALF_SLUR_SEGMENT
    }

    isLineSegment(): boolean {
        return this.isGlissandoSegment()
               || this.isLyricsLineSegment()
               || this.isTextLineBaseSegment()
               || this.isTrillSegment()
               || this.isVibratoSegment()
               || this.isGuitarBendSegment()
               || this.isGuitarBendHoldSegment()
    }

    isTieSegment(): boolean {
        return this.m_type === ElementType.TIE_SEGMENT || this.m_type === ElementType.LAISSEZ_VIB_SEGMENT
               || this.m_type === ElementType.PARTIAL_TIE_SEGMENT
    }

    isTie(): boolean {
        return this.m_type === ElementType.TIE || this.m_type === ElementType.LAISSEZ_VIB || this.m_type === ElementType.PARTIAL_TIE
    }

    isSpannerSegment(): boolean {
        return this.isLineSegment() || this.isTextLineBaseSegment() || this.isSlurSegment() || this.isTieSegment()
    }

    isBSymbol(): boolean { return this.isImage() || this.isSymbol() }

    isTextLineBase(): boolean {
        return this.isHairpin()
               || this.isLetRing()
               || this.isGradualTempoChange()
               || this.isTextLine()
               || this.isOttava()
               || this.isPalmMute()
               || this.isPickScrape()
               || this.isWhammyBar()
               || this.isRasgueado()
               || this.isHarmonicMark()
               || this.isPedal()
               || this.isVolta()
               || this.isNoteLine()
    }

    isLyricsLine(): boolean { return this.m_type === ElementType.LYRICSLINE || this.m_type === ElementType.PARTIAL_LYRICSLINE }

    isLyricsLineSegment(): boolean {
        return this.m_type === ElementType.LYRICSLINE_SEGMENT || this.m_type === ElementType.PARTIAL_LYRICSLINE_SEGMENT
    }

    isSLine(): boolean {
        return this.isTextLineBase() || this.isTrill() || this.isGlissando() || this.isVibrato() || this.isGuitarBend()
               || this.isGuitarBendHold()
    }

    isSpanner(): boolean {
        return this.isSlur() || this.isTie() || this.isLyricsLine() || this.isSLine()
    }

    isStaffTextBase(): boolean {
        return this.isStaffText() || this.isSystemText() || this.isTripletFeel() || this.isPlayTechAnnotation() || this.isCapo()
               || this.isStringTunings()
    }

    isArticulationFamily(): boolean { return this.isArticulation() || this.isOrnament() || this.isTapping() }
    isArticulationOrFermata(): boolean { return this.isArticulationFamily() || this.isFermata() }
    isIndicatorIcon(): boolean { return this.isSystemLockIndicator() || this.isStaffVisibilityIndicator() }

    isSLineSegment(): boolean {
        return this.isHairpinSegment() || this.isOttavaSegment() || this.isPedalSegment()
               || this.isTrillSegment() || this.isVoltaSegment() || this.isTextLineSegment()
               || this.isGlissandoSegment() || this.isLetRingSegment() || this.isVibratoSegment() || this.isPalmMuteSegment()
               || this.isGradualTempoChangeSegment() || this.isWhammyBarSegment()
    }

    isArticulation(): boolean { return this.m_type === ElementType.ARTICULATION }
    isTapping(): boolean { return this.m_type === ElementType.TAPPING }
}
