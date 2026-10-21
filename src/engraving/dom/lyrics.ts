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
// (imports of the editing section)
import { isTextNavigationKey } from './textbase'
import { SegmentType } from './segment'
import { KeyboardKey, KeyboardModifier, type EditData } from '../editing/editdata'
import { TranslatableString } from '../../framework/global/types/translatablestring'

/** C++ prevLyrics() of navigate.cpp, set by dom/navigate.ts (lyrics.ts cannot import it: import cycles) */
export const lyricsNavigation: { prevLyrics(lyrics: Lyrics): Lyrics | null } = {
    prevLyrics: () => null,
}

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

    // =================================================================================================================
    //   editing (lyrics.cpp)
    // =================================================================================================================

    /** THIS WAS A HORRIBLE HACK. At some point we must remove it and replace it with a proper solution. (M.S.) */
    static readonly TEMP_MELISMA_TICKS = Fraction.eps()

    override isEditAllowed(ed: EditData): boolean {
        if (isTextNavigationKey(ed.key, ed.modifiers)) {
            return false
        }

        const navigationModifiers = [KeyboardModifier.NoModifier, KeyboardModifier.KeypadModifier, KeyboardModifier.ShiftModifier]

        if (navigationModifiers.includes(ed.modifiers)) {
            const navigationKeys = [
                KeyboardKey.Key_Underscore,
                KeyboardKey.Key_Minus,
                KeyboardKey.Key_Enter,
                KeyboardKey.Key_Return,
                KeyboardKey.Key_Up,
                KeyboardKey.Key_Down,
            ]

            if (navigationKeys.includes(ed.key)) {
                return false
            }
        }

        if (ed.key === KeyboardKey.Key_Left || ed.key === KeyboardKey.Key_Backspace) {
            return this.cursor().column() !== 0 || this.cursor().hasSelection()
        }

        if (ed.key === KeyboardKey.Key_Right) {
            const cursorInLastColumn = this.cursor().column() === this.cursor().curLine().columns()
            return !cursorInLastColumn || this.cursor().hasSelection()
        }

        return super.isEditAllowed(ed)
    }

    adjustPrevious(): void {
        const prev = lyricsNavigation.prevLyrics(this)
        if (prev) {
            // search for lyric spanners to split at this point if necessary
            if (prev.tick().plus(prev.ticks()).ge(this.tick())) {
                // the previous lyric has a spanner attached that goes through this one
                // we need to shorten it
                let s = this.score().tick2segment(this.tick())
                if (s) {
                    s = s.prev1(SegmentType.ChordRest)!
                    if (s.tick().gt(prev.tick())) {
                        prev.undoChangeProperty(Pid.LYRIC_TICKS, s.tick().minus(prev.tick()))
                    } else {
                        prev.undoChangeProperty(Pid.LYRIC_TICKS, Fraction.eps())
                    }
                    prev.setNeedRemoveInvalidSegments()
                    prev.triggerLayout()
                }
            }
        }
    }

    override endEdit(ed: EditData): void {
        super.endEdit(ed)

        this.triggerLayout()
        if (this.m_separator) {
            this.m_separator.triggerLayout()
        }
    }

    override paste(ed: EditData, txt: string): void {
        if (txt.startsWith('<') && txt.includes('>')) {
            super.paste(ed, txt)
            return
        }

        const sl = txt.split(/[^\S  ]+/).filter(s => s.length > 0)
        if (sl.length === 0) {
            return
        }

        const hyph = sl[0].split('-')
        this.score().startCmd(new TranslatableString('undoableAction', 'Paste lyrics'))

        this.deleteSelectedText(ed)

        // C++ score()->undo(new InsertText(cursorFromEditData(ed), s), &ed) = TextBase::insertText
        const insert = (s: string): void => this.insertText(ed, s)
        if (hyph.length > 1) {
            insert(hyph[0])
        } else if (sl.length > 1 && sl[1] === '-') {
            insert(sl[0])
        } else if (sl[0].startsWith('_')) {
            // nothing to insert
        } else if (sl[0].includes('_')) {
            insert(sl[0])
        } else if (sl.length > 1 && sl[1] === '_') {
            insert(sl[0])
        } else {
            insert(sl[0])
        }

        this.score().endCmd()
    }
}
