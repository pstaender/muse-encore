/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/chordrest.h/.cpp
 */

import type { MasterScore } from './masterscore'
import type { InstrumentChange } from './instrchange'
import { Instrument } from './instrument'
import type { HarpPedalDiagram } from './harppedaldiagram'
import type { RehearsalMark } from './rehearsalmark'
import { PointF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import {
    BarLineType, BeamMode, DurationType, DurationTypeWithDots, ElementType, PlacementV, VOICES, trackZeroVoice,
    type staff_idx_t, type track_idx_t,
    nidx,
} from '../types/types'
import { DurationElement } from './durationelement'
import { TDuration } from './durationtype'
import { EngravingItem, LayoutData } from './engravingitem'
import { Pid } from './property'
import type { EngravingObject } from './engravingobject'
import { SegmentType as SegmentTypeValue, type Segment, type SegmentType } from './segment'
import type { BarLine } from './barline'
import type { Clef } from './clef'
import type { Breath } from './breath'
import type { KeySig } from './keysig'
import type { Spanner } from './spanner'
import { KeyboardModifier, type EditData } from '../editing/editdata'
import type { Beam } from './beam'
import type { Lyrics } from './lyrics'
import type { Chord } from './chord'
import type { TabDurationSymbol } from './tabdurationsymbol'
import { findFollowingRepeatMeasures, findPreviousRepeatMeasures } from './utils'
import { arg, mtrc } from '../../framework/global/translation'
import { TConv } from '../types/typesconv'

/** C++ renderer() calls from the DOM; set by the layout module */
export const chordRestRenderer: {
    layoutBeam1?: (b: Beam) => void
    layoutStem?: (c: Chord) => void
} = {}

export enum CrossMeasure {
    UNKNOWN = -1,
    NONE = 0,
    FIRST,
    SECOND,
}

/** set by editing/splitjoinmeasure.ts (C++ calls SplitJoinMeasure::splitMeasure; avoids a circular import) */
export const chordRestEditHooks: { splitMeasure?: (masterScore: MasterScore, tick: Fraction) => void } = {}

export enum NoteType {
    NORMAL = 0,
    ACCIACCATURA = 0x1,
    APPOGGIATURA = 0x2, // grace notes
    GRACE4 = 0x4,
    GRACE16 = 0x8,
    GRACE32 = 0x10,
    GRACE8_AFTER = 0x20,
    GRACE16_AFTER = 0x40,
    GRACE32_AFTER = 0x80,
    INVALID = 0xFF,
}

export class ChordRestLayoutData extends LayoutData {
    up = true // actual stem direction
}

export abstract class ChordRest extends DurationElement {
    protected m_lyrics: Lyrics[] = []
    protected m_beam: Beam | null = null
    private m_tabDur: TabDurationSymbol | null = null // stores a duration symbol in tablature staves
    protected m_beamlet: unknown = null
    protected m_beamMode: BeamMode = BeamMode.AUTO
    protected m_isSmall = false
    protected m_melismaEnd = false
    protected m_crossMeasure: CrossMeasure = CrossMeasure.UNKNOWN
    protected m_crossMeasureTDur = new TDuration()

    private m_el: EngravingItem[] = []
    private m_durationType = new TDuration()
    private m_staffMove = 0 // -1, 0, +1, used for crossbeaming
    private m_storedStaffMove = 0

    constructor(type: ElementType, parent: EngravingObject | null) {
        super(type, parent)
    }

    protected override createLayoutData(): ChordRestLayoutData { return new ChordRestLayoutData(this) }
    override ldata(): ChordRestLayoutData { return super.ldata() as ChordRestLayoutData }
    override mutldata(): ChordRestLayoutData { return super.ldata() as ChordRestLayoutData }

    setUp(val: boolean): void { this.mutldata().up = val }
    up(): boolean { return this.ldata().up }

    segment(): Segment { return this.explicitParent() as unknown as Segment }

    setBeamMode(m: BeamMode): void { this.m_beamMode = m }
    beamMode(): BeamMode { return this.m_beamMode }

    setBeam(b: Beam | null): void { this.m_beam = b }
    setBeamlet(b: unknown): void { this.m_beamlet = b }
    beamlet(): unknown { return this.m_beamlet }

    removeDeleteBeam(beamed: boolean): void {
        this.setBeamlet(null)
        if (this.m_beam) {
            const b = this.m_beam
            this.m_beam.remove(this)
            if (b.empty()) {
                this.score().doUndoRemoveElement(b)
            } else {
                chordRestRenderer.layoutBeam1!(b)
            }
        }
        if (!beamed && this.isChord()) {
            const c = this as unknown as Chord
            if (c.shouldHaveHook()) {
                if (!c.hook()) {
                    c.createHook()
                }
            } else if (c.hook()) {
                this.score().doUndoRemoveElement(c.hook()!)
            }
            chordRestRenderer.layoutStem!(c)
        }
    }

    replaceBeam(newBeam: Beam): void {
        if (this.m_beam === newBeam) {
            return
        }
        this.removeDeleteBeam(true)
        newBeam.add(this)
    }

    override beam(): Beam | null {
        const m = this.explicitParent() ? this.measure() : null
        return !(m && m.stemless(this.staffIdx())) ? this.m_beam : null
    }

    beams(): number { return this.m_durationType.hooks() }

    abstract upPos(): number
    abstract downPos(): number
    abstract rightEdge(): number
    abstract intrinsicMag(): number

    isSmall(): boolean { return this.m_isSmall }
    setSmall(val: boolean): void { this.m_isSmall = val }

    staffMove(): number { return this.m_staffMove }
    setStaffMove(val: number): void { this.m_staffMove = val }
    storedStaffMove(): number { return this.m_storedStaffMove }
    override vStaffIdx(): staff_idx_t { return this.staffIdx() + this.m_staffMove }

    checkStaffMoveValidity(): void {
        // TODO(port): validate cross staff moves (needs part/staff type checks)
    }

    durationType(): TDuration {
        return this.m_crossMeasure === CrossMeasure.FIRST ? this.m_crossMeasureTDur : this.m_durationType
    }

    actualDurationType(): TDuration { return this.m_durationType }

    setDurationType(v: DurationType | Fraction | TDuration | DurationTypeWithDots): void {
        if (v instanceof TDuration) {
            this.m_durationType = v.clone()
        } else if (v instanceof Fraction) {
            this.m_durationType = new TDuration()
            this.m_durationType.setVal(v.ticks())
        } else if (v instanceof DurationTypeWithDots) {
            this.m_durationType = new TDuration(v)
        } else {
            this.m_durationType.setType(v)
        }
        this.m_crossMeasure = CrossMeasure.UNKNOWN
    }

    setDots(n: number): void { this.m_durationType.setDots(n) }

    dots(): number {
        return this.m_crossMeasure === CrossMeasure.FIRST
            ? this.m_crossMeasureTDur.dots()
            : (this.m_crossMeasure === CrossMeasure.SECOND ? 0 : this.m_durationType.dots())
    }

    actualDots(): number { return this.m_durationType.dots() }

    durationTypeTicks(): Fraction {
        return this.m_crossMeasure === CrossMeasure.FIRST ? this.m_crossMeasureTDur.ticks() : this.m_durationType.ticks()
    }

    override setTrack(val: track_idx_t): void {
        super.setTrack(val)
        this.processSiblings(e => e.setTrack(val))
    }

    private processSiblings(func: (e: EngravingItem) => void): void {
        if (this.m_beam) {
            func(this.m_beam)
        }
        for (const l of this.m_lyrics) {
            func(l)
        }
        const t = this.tuplet()
        if (t) {
            func(t)
        }
        for (const e of this.m_el) {
            func(e)
        }
    }

    lyrics(): Lyrics[] { return this.m_lyrics }

    /** C++ hasBreathMark(): the breath mark (or caesura) after this chord or rest, if any */
    hasBreathMark(): Breath | null {
        const s = this.measure()!.findSegment(SegmentTypeValue.Breath, this.endTick())
        return s ? s.element(this.track()) as Breath | null : null
    }

    lyricsVerse(verse: number, p?: PlacementV): Lyrics | null {
        for (const l of this.m_lyrics) {
            if (l.verse() === verse && (p === undefined || l.placement() === p)) {
                return l
            }
        }
        return null
    }

    lastVerse(p: PlacementV): number {
        let lastVerse = -1
        for (const l of this.m_lyrics) {
            if (l.placement() === p && l.verse() > lastVerse) {
                lastVerse = l.verse()
            }
        }
        return lastVerse
    }

    isMelismaEnd(): boolean { return this.m_melismaEnd }
    setMelismaEnd(v: boolean): void { this.m_melismaEnd = v }

    // ---------------------------------------------------------
    //   drop
    // ---------------------------------------------------------

    override acceptDrop(data: EditData): boolean {
        const e = data.dropElement!

        switch (e.type()) {
        case ElementType.FERMATA:
        case ElementType.CLEF:
        case ElementType.KEYSIG:
        case ElementType.TIMESIG:
        case ElementType.SYSTEM_TEXT:
        case ElementType.TRIPLET_FEEL:
        case ElementType.STAFF_TEXT:
        case ElementType.PLAYTECH_ANNOTATION:
        case ElementType.CAPO:
        case ElementType.BAR_LINE:
        case ElementType.BREATH:
        case ElementType.STAFF_STATE:
        case ElementType.INSTRUMENT_CHANGE:
        case ElementType.DYNAMIC:
        case ElementType.EXPRESSION:
        case ElementType.HARMONY:
        case ElementType.TEMPO_TEXT:
        case ElementType.REHEARSAL_MARK:
        case ElementType.FRET_DIAGRAM:
        case ElementType.TREMOLOBAR:
        case ElementType.HARP_DIAGRAM:
            return true
        // TODO(port): ACTION_ICON (beam modes)
        default: break
        }
        return this.segment().measure().acceptDrop(data)
    }

    override drop(data: EditData): EngravingItem | null {
        const e = data.dropElement!
        let m = this.segment().measure()
        const fromPalette = e.track() === nidx
        switch (e.type()) {
        case ElementType.BREATH: {
            const b = e
            b.setPos(new PointF())
            // allow breath marks in voice > 1
            b.setTrack(this.track())
            b.setPlacement(b.track() & 1 ? PlacementV.BELOW : PlacementV.ABOVE)

            // TODO: insert automatically in all staves?

            const seg = m.undoGetSegment(SegmentTypeValue.Breath, this.endTick())
            b.setParent(seg)
            this.score().undoAddElement(b)
            return e
        }

        case ElementType.BAR_LINE: {
            const bl = e as unknown as BarLine
            const barLineTick = bl.barLineType() === BarLineType.START_REPEAT ? this.tick() : this.endTick()

            if (data.control()) {
                chordRestEditHooks.splitMeasure!(this.masterScore(), barLineTick)
                m = this.score().tick2measure(this.tick())!
                // consume the ControlModifier flag
                data.modifiers &= ~KeyboardModifier.ControlModifier
            }

            if (barLineTick.eq(m.tick()) || barLineTick.eq(m.endTick())) {
                return m.drop(data)
            }

            bl.setPos(new PointF())
            bl.setTrack(this.staffIdx() * VOICES)
            bl.setGenerated(false)

            let obl: BarLine | null = null
            for (const st of this.staff()!.staffList()) {
                const score = st.score()
                const measure = score.tick2measure(m.tick())!
                const seg = measure.undoGetSegment(SegmentTypeValue.BarLine, barLineTick)
                let l: BarLine
                if (!obl) {
                    obl = l = bl.clone() as BarLine
                } else {
                    l = obl.linkedClone() as BarLine
                }
                l.setTrack(st.idx() * VOICES)
                l.setParent(seg)
                score.undoAddElement(l)
            }

            return null
        }

        case ElementType.CLEF:
            this.score().cmdInsertClef(e as unknown as Clef, this)
            return null

        case ElementType.FERMATA:
            e.setPlacement(this.track() & 1 ? PlacementV.BELOW : PlacementV.ABOVE)
            for (const el of this.segment().annotations()) {
                if (el.isFermata() && (el.track() === this.track())) {
                    if (el.subtype() === e.subtype()) {
                        return el
                    } else {
                        e.setPlacement(el.placement())
                        e.setTrack(this.track())
                        e.setParent(this.segment())
                        this.score().undoChangeElement(el, e)
                        return e
                    }
                }
            }
            e.setTrack(this.track())
            e.setParent(this.segment())
            this.score().undoAddElement(e)
            return e

        case ElementType.TEMPO_TEXT:
        case ElementType.EXPRESSION:
        case ElementType.FRET_DIAGRAM:
        case ElementType.TREMOLOBAR:
        case ElementType.SYMBOL:
        case ElementType.IMAGE:
            e.setTrack(this.track())
            e.setParent(this.segment())
            this.score().undoAddElement(e)
            return e

        case ElementType.DYNAMIC:
            e.setTrack(this.track())
            // TODO(port): checkVoiceAssignmentCompatibleWithTrack()
            e.setParent(this.segment())
            this.score().undoAddElement(e)
            return e

        // TODO(port): NOTE (replace the rest by a chord with the note: drum palette)

        case ElementType.HARMONY:
            // TODO(port): transpose the harmony (Transpose::undoTransposeHarmony) for transposing instruments
        // fallthrough
        case ElementType.TEXT:
        case ElementType.STAFF_TEXT:
        case ElementType.SYSTEM_TEXT:
        case ElementType.TRIPLET_FEEL:
        case ElementType.PLAYTECH_ANNOTATION:
        case ElementType.CAPO:
        case ElementType.STICKING:
        case ElementType.STAFF_STATE:
        case ElementType.HARP_DIAGRAM:
        case ElementType.REHEARSAL_MARK: {
            e.setParent(this.segment())
            e.setTrack(trackZeroVoice(this.track()))
            if (e.isRehearsalMark() && fromPalette) {
                const r = e as unknown as RehearsalMark
                r.setXmlText(this.score().createRehearsalMarkText(r))
            } else if (e.isHarpPedalDiagram() && fromPalette && this.part()) {
                // Match pedal config with previous diagram's
                const prevDiagram = this.part()!.prevHarpDiagram(this.segment().tick())
                if (prevDiagram) {
                    (e as unknown as HarpPedalDiagram).setPedalState(prevDiagram.getPedalState())
                }
            }
            this.score().undoAddElement(e)
            return e
        }

        case ElementType.INSTRUMENT_CHANGE:
            if (this.part()!.instruments().has(this.tick().ticks())) {
                // C++ LOGD() << "InstrumentChange already exists at tick = " << tick().ticks()
                return null
            } else {
                const ic = e as unknown as InstrumentChange
                ic.setParent(this.segment())
                ic.setTrack(trackZeroVoice(this.track()))

                const prevInstr = this.part()!.instrument(this.tick())
                const instr = new Instrument()
                instr.assign(ic.instrument())

                // temporarily set previous instrument, for correct transposition calculation
                ic.setInstrument(prevInstr)
                this.score().undoAddElement(ic)

                if (!fromPalette) {
                    ic.setupInstrument(instr)
                }
                return e
            }

        // TODO(port): FIGURED_BASS, ACTION_ICON (beam modes)

        case ElementType.KEYSIG: {
            if (data.modifiers & KeyboardModifier.ControlModifier) {
                // apply only to this stave
                const k = (e as unknown as KeySig).keySigEvent()
                this.score().undoChangeKeySig(this.staff()!, this.tick(), k)
                return null
            }
            break
        }

        default:
            if (e.isSpanner()) {
                const spanner = e as unknown as Spanner
                spanner.setTick(this.tick())
                if (spanner.systemFlag()) {
                    spanner.setTrack(0)
                    spanner.setTrack2(0)
                } else {
                    spanner.setTrack(this.track())
                    spanner.setTrack2(this.track())
                }
                this.score().undoAddElement(spanner)
                return e
            }
            break
        }
        return m.drop(data)
    }

    override add(e: EngravingItem): void {
        e.setParent(this)
        e.setTrack(this.track())
        switch (e.type()) {
        case ElementType.ARTICULATION: // for backward compatibility
            break
        case ElementType.LYRICS:
            if (e.isStyled(Pid.OFFSET)) {
                e.setOffset(e.propertyDefault(Pid.OFFSET) as PointF)
            }
            this.m_lyrics.push(e as Lyrics)
            break
        default:
            super.add(e)
            break
        }
    }

    override remove(e: EngravingItem): void {
        if (e.type() === ElementType.LYRICS) {
            (e as Lyrics).removeFromScore()
            const i = this.m_lyrics.indexOf(e as Lyrics)
            if (i >= 0) {
                this.m_lyrics.splice(i, 1)
                e.removed()
            }
            return
        }
        super.remove(e)
    }

    el(): EngravingItem[] { return this.m_el }

    /**
     * - this is normally called after cloning a chord to tie a note over the barline
     * - there is no special undo handling; the assumption is that undo will simply remove the cloned chord
     * - two note tremolos are converted into simple notes
     * - single note tremolos are optionally retained
     */
    removeMarkings(_keepTremolo = false): void {
        this.m_el = []
        this.m_lyrics = []
    }

    undoAddAnnotation(a: EngravingItem): void {
        let seg = this.segment()
        const m = this.measure()
        if (m && m.isMMRest()) {
            seg = m.mmRestFirst()!.findSegmentR(SegmentTypeValue.ChordRest, new Fraction(0, 1))!
        }

        a.setTrack(/*a->systemFlag() ? 0 : */ this.track())
        a.setParent(seg)
        this.score().undoAddElement(a)
    }

    protected addEl(e: EngravingItem): void { this.m_el.push(e) }
    protected removeEl(e: EngravingItem): boolean {
        const i = this.m_el.indexOf(e)
        if (i >= 0) {
            this.m_el.splice(i, 1)
            return true
        }
        return false
    }
    addFermata(f: EngravingItem): void { this.addEl(f) }

    crossMeasure(): CrossMeasure { return this.m_crossMeasure }
    setCrossMeasure(val: CrossMeasure): void { this.m_crossMeasure = val }
    crossMeasureDurationType(): TDuration { return this.m_crossMeasureTDur }
    setCrossMeasureDurationType(v: TDuration): void { this.m_crossMeasureTDur = v }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SMALL: return this.isSmall()
        case Pid.BEAM_MODE: return this.beamMode()
        case Pid.STAFF_MOVE: return this.staffMove()
        case Pid.DURATION_TYPE_WITH_DOTS: return this.actualDurationType().typeWithDots()
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.SMALL:
            this.setSmall(!!v)
            break
        case Pid.BEAM_MODE:
            this.setBeamMode(v as BeamMode)
            break
        case Pid.STAFF_MOVE:
            this.setStaffMove(v as number)
            break
        case Pid.VISIBLE:
            this.setVisible(!!v)
            if (this.explicitParent()) {
                this.measure().checkMultiVoices(this.staffIdx())
            }
            break
        case Pid.DURATION_TYPE_WITH_DOTS:
            this.setDurationType(v as DurationTypeWithDots)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SMALL:
            return false
        case Pid.BEAM_MODE:
            return BeamMode.AUTO
        case Pid.STAFF_MOVE:
            return 0
        default:
            return super.propertyDefault(propertyId)
        }
    }

    isGrace(): boolean { return false }
    isGraceBefore(): boolean { return false }
    isGraceAfter(): boolean { return false }

    nextSegmentAfterCR(types: SegmentType): Segment | null {
        const end = this.tick().plus(this.actualTicks())
        for (let s = this.segment().next1MM(types); s; s = s.next1MM(types)) {
            if (s.tick().ge(end)) {
                return s
            }
        }
        return null
    }

    computeUp(): void {}

    isFullMeasureRest(): boolean { return this.m_durationType.equals(DurationType.V_MEASURE) }

    isBelowCrossBeam(beamBase: { crossStaffIdx(): number }): boolean {
        return this.staffMove() >= beamBase.crossStaffIdx()
    }

    override scanElements(func: (item: EngravingItem) => void): void {
        if (this.m_beam && (this.m_beam.elements()[0] === this)
            && !this.measure().stemless(this.staffIdx())) {
            this.m_beam.scanElements(func)
        }
        for (const l of this.m_lyrics) {
            l.scanElements(func)
        }
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let de: DurationElement = this
        while (de.tuplet() && de.tuplet()!.elements()[0] === de) {
            de.tuplet()!.scanElements(func)
            de = de.tuplet()!
        }
        if (this.m_tabDur) {
            func(this.m_tabDur)
        }
    }

    hasFollowingJumpItem(): boolean {
        const seg = this.segment()
        const measure = seg ? seg.measure() : null
        if (!measure) {
            return false
        }

        if (!this.endTick().eq(measure.endTick())) {
            return false
        }

        return findFollowingRepeatMeasures(measure).length > 0
    }

    hasPrecedingJumpItem(): boolean {
        const seg = this.segment()!
        const measure = seg.measure()

        if (!this.tick().eq(measure.tick())) {
            return false
        }

        return findPreviousRepeatMeasures(measure).length > 0
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_beam = null
        this.m_beamlet = null
        this.m_tabDur = null // tab dur. symb. depends upon context: can't be simply copied from another CR
        this.m_el = [] // not copied by the C++ copy constructor
        this.m_storedStaffMove = 0

        this.m_lyrics = []
        for (const l of original.m_lyrics) { // make deep copy
            const nl = l.clone() as Lyrics
            if (this.isLinkedCopy(original)) {
                nl.linkTo(l)
            }
            nl.setParent(this)
            nl.setTrack(this.track())
            this.m_lyrics.push(nl)
        }
    }

    tabDur(): TabDurationSymbol | null { return this.m_tabDur }
    setTabDur(s: TabDurationSymbol | null): void { this.m_tabDur = s }

    durationUserName(): string {
        let tupletType = ''
        const tuplet = this.tuplet()
        if (tuplet) {
            switch (tuplet.ratio().numerator()) {
            case 2:
                tupletType = mtrc('engraving', 'Duplet')
                break
            case 3:
                tupletType = mtrc('engraving', 'Triplet')
                break
            case 4:
                tupletType = mtrc('engraving', 'Quadruplet')
                break
            case 5:
                tupletType = mtrc('engraving', 'Quintuplet')
                break
            case 6:
                tupletType = mtrc('engraving', 'Sextuplet')
                break
            case 7:
                tupletType = mtrc('engraving', 'Septuplet')
                break
            case 8:
                tupletType = mtrc('engraving', 'Octuplet')
                break
            case 9:
                tupletType = mtrc('engraving', 'Nonuplet')
                break
            default:
                //: %1 is tuplet ratio numerator (i.e. the number of notes in the tuplet)
                tupletType = arg(mtrc('engraving', '%1 note tuplet'), tuplet.ratio().numerator())
            }
        }
        let dotString = ''
        if (tupletType.length) {
            dotString += ' '
        }

        const durationName = TConv.translatedUserNameDurationType(this.durationType().type())
        switch (this.dots()) {
        case 1:
            dotString += arg(mtrc('engraving', 'Dotted %1'), durationName)
            break
        case 2:
            dotString += arg(mtrc('engraving', 'Double dotted %1'), durationName)
            break
        case 3:
            dotString += arg(mtrc('engraving', 'Triple dotted %1'), durationName)
            break
        case 4:
            dotString += arg(mtrc('engraving', 'Quadruple dotted %1'), durationName)
            break
        default:
            dotString += durationName
        }
        return tupletType + dotString
    }
}
