/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/lyrics.h/.cpp
 *
 * TODO(port): LyricsLine (separator dashes / melisma lines), editing
 */

import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, LyricsSyllabic, PlacementV, TextStyleType, VOICES, type Align } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag, type EngravingItem } from './engravingitem'
import type { ElementStyle } from './engravingobject'
import { Pid } from './property'
import { TextBase } from './textbase'
import type { ChordRest } from './chordrest'
import type { Measure } from './measure'
import type { Segment } from './segment'
import type { Spanner } from './spanner'

const lyricsElementStyle: ElementStyle = [
    { sid: Sid.lyricsPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.lyricsAvoidBarlines, pid: Pid.AVOID_BARLINES },
]

export class Lyrics extends TextBase {
    private m_verse = 0 // row index
    private m_ticks = new Fraction(0, 1) // if > 0 then draw an underline to tick() + _ticks (melisma)
    private m_syllabic = LyricsSyllabic.SINGLE
    private m_separator: Spanner | null = null
    private m_needRemoveInvalidSegments = false
    private m_avoidBarlines = true

    constructor(parent: ChordRest | null) {
        super(ElementType.LYRICS, parent, TextStyleType.LYRICS_ODD, ElementFlag.ON_STAFF)
        this.initElementStyle(lyricsElementStyle)
    }

    /** C++ copy constructor: the separator (melisma/dash line) is not copied, the other members not copied keep their defaults */
    protected override onCloned(original: this): void {
        super.onCloned(original)
        this.m_separator = null
        this.m_needRemoveInvalidSegments = false
        this.m_avoidBarlines = true
    }

    segment(): Segment { return this.explicitParent()!.explicitParent() as unknown as Segment }
    measure(): Measure { return this.explicitParent()!.explicitParent()!.explicitParent() as unknown as Measure }
    chordRest(): ChordRest { return this.explicitParent() as unknown as ChordRest }

    override subtype(): number { return this.m_verse }
    setVerse(n: number): void { this.m_verse = n }
    verse(): number { return this.m_verse }
    isEven(): boolean { return (this.m_verse % 2) !== 0 }
    setSyllabic(s: LyricsSyllabic): void { this.m_syllabic = s }
    syllabic(): LyricsSyllabic { return this.m_syllabic }

    override add(el: EngravingItem): void {
        if (el.isLyricsLine()) {
            this.m_separator = el as unknown as Spanner
            this.score().addUnmanagedSpanner(this.m_separator)
        }
    }

    override remove(el: EngravingItem): void {
        if (el.isLyricsLine() && this.m_separator && el === (this.m_separator as unknown as EngravingItem)) {
            this.m_separator = null
        }
    }

    override positionRelativeToNoteheadRest(): boolean { return true }

    ticks(): Fraction { return this.m_ticks }
    setTicks(tick: Fraction): void { this.m_ticks = tick }
    endTick(): Fraction { return this.segment().tick().plus(this.ticks()) }

    needRemoveInvalidSegments(): boolean { return this.m_needRemoveInvalidSegments }
    setNeedRemoveInvalidSegments(): void { this.m_needRemoveInvalidSegments = true }

    separator(): Spanner | null { return this.m_separator }
    setSeparator(s: Spanner | null): void { this.m_separator = s }

    isMelisma(): boolean {
        // entered as melisma using underscore?
        if (this.m_ticks.gt(new Fraction(0, 1))) {
            return true
        }
        // hyphenated?
        // if so, it is a melisma only if there is no lyric in same verse on next CR
        if (this.m_separator && (this.m_syllabic === LyricsSyllabic.BEGIN || this.m_syllabic === LyricsSyllabic.MIDDLE)) {
            // find next CR on same track and check for existence of lyric in same verse and placement
            const cr = this.chordRest()
            if (cr) {
                const s = cr.segment().next1()
                const strack = this.staffIdx() * VOICES
                const etrack = strack + VOICES
                const lyrTrack = this.track()
                const lyrVoiceNextCR = s ? s.nextChordRest(lyrTrack) : null
                for (let track = strack; track < etrack; ++track) {
                    const trackNextCR = s ? s.nextChordRest(track) : null
                    if (trackNextCR) {
                        if (lyrTrack !== track && lyrVoiceNextCR
                            && !lyrVoiceNextCR.lyricsVerse(this.m_verse, this.placement())
                            && lyrVoiceNextCR.tick().lt(trackNextCR.tick())) {
                            return true
                        }
                        if (trackNextCR.lyricsVerse(this.m_verse, this.placement())) {
                            return false
                        }
                    }
                }
                return true
            }
        }
        // default - not a melisma
        return false
    }

    avoidBarlines(): boolean { return this.m_avoidBarlines }
    setAvoidBarlines(v: boolean): void { this.m_avoidBarlines = v }

    yRelativeToStaff(): number {
        const yOff = this.staffOffsetY()
        return this.pos().y() + this.chordRest().pos().y() + yOff
    }

    setYRelativeToStaff(y: number): void {
        const yOff = this.staffOffsetY()
        this.mutldata().setPosY(y - this.chordRest().pos().y() - yOff)
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SYLLABIC: return this.m_syllabic
        case Pid.LYRIC_TICKS: return this.m_ticks
        case Pid.VERSE: return this.m_verse
        case Pid.AVOID_BARLINES: return this.m_avoidBarlines
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.PLACEMENT:
            this.setPlacement(v as PlacementV)
            break
        case Pid.SYLLABIC:
            this.m_syllabic = v as LyricsSyllabic
            break
        case Pid.LYRIC_TICKS:
            this.m_ticks = v as Fraction
            break
        case Pid.VERSE: {
            const followTextStyle = this.getProperty(Pid.TEXT_STYLE) === this.propertyDefault(Pid.TEXT_STYLE)
            this.m_verse = v as number
            if (followTextStyle) {
                this.setProperty(Pid.TEXT_STYLE, this.propertyDefault(Pid.TEXT_STYLE))
            }
            break
        }
        case Pid.AVOID_BARLINES:
            this.m_avoidBarlines = !!v
            break
        case Pid.VISIBLE:
            this.setVisible(!!v)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.TEXT_STYLE: return this.isEven() ? TextStyleType.LYRICS_EVEN : TextStyleType.LYRICS_ODD
        case Pid.PLACEMENT: return this.style().styleV(Sid.lyricsPlacement)
        case Pid.SYLLABIC: return LyricsSyllabic.SINGLE
        case Pid.LYRIC_TICKS: return new Fraction(0, 1)
        case Pid.VERSE: return 0
        case Pid.AVOID_BARLINES: return this.style().styleB(Sid.lyricsAvoidBarlines)
        case Pid.POSITION:
            if (this.explicitParent() && this.isMelisma()) {
                return (this.style().styleV(Sid.lyricsMelismaAlign) as Align).horizontal
            }
            return super.propertyDefault(id)
        default:
            return super.propertyDefault(id)
        }
    }
}
