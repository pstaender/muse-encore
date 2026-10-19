/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/lyricslayout.h/.cpp
 *
 * TODO(port): partial lyrics lines, repeat structure (segmentsAreAdjacent, jumps)
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { AlignH, VOICES, type Align, type staff_idx_t } from '../../types/types'
import { SkylineLine } from '../../infrastructure/skyline'
import { Sid } from '../../style/styledef'
import { Pid } from '../../dom/property'
import type { ChordRest } from '../../dom/chordrest'
import type { Lyrics } from '../../dom/lyrics'
import type { Measure } from '../../dom/measure'
import type { System } from '../../dom/system'
import type { LayoutContext } from './layoutcontext'
import { TextLayout } from './textlayout'
import { LineF, RectF } from '../../../framework/draw/types/geometry'
import { RealIsNull } from '../../../framework/global/realfn'
import { Fraction } from '../../types/fraction'
import { LyricsDashSystemStart, LyricsSyllabic, nidx, type PlacementV } from '../../types/types'
import { Shape } from '../../infrastructure/shape'
import { SegmentType, type Segment } from '../../dom/segment'
import type { Chord } from '../../dom/chord'
import { LyricsLine, type LyricsLineSegment } from '../../dom/lyricsline'

class LyricsVerse {
    private m_lyrics: Lyrics[] = []
    private m_lines: LyricsLineSegment[] = []

    addLyrics(l: Lyrics): void { this.m_lyrics.push(l) }
    addLine(l: LyricsLineSegment): void { this.m_lines.push(l) }
    lyrics(): readonly Lyrics[] { return this.m_lyrics }
    lines(): readonly LyricsLineSegment[] { return this.m_lines }
}

/** C++ Lyrics::TEMP_MELISMA_TICKS */
const TEMP_MELISMA_TICKS = Fraction.eps()

/**
 * dom/utils.cpp segmentsAreAdjacent()
 * TODO(port): repeat list; without it, segments are adjacent if they are in the same or in consecutive measures
 */
function segmentsAreAdjacent(firstSeg: Segment | null, secondSeg: Segment | null): boolean {
    if (!firstSeg || !secondSeg) {
        return false
    }
    const firstMeasure = firstSeg.measure()
    const secondMeasure = secondSeg.measure()
    return firstMeasure === secondMeasure || firstMeasure.nextMeasure() === secondMeasure
}

/** dom/utils.cpp searchNextLyrics() */
function searchNextLyrics(s: Segment | null, staffIdx: staff_idx_t, verse: number, p: PlacementV): Lyrics | null {
    let l: Lyrics | null = null
    const originalSeg = s
    while ((s = s!.next1(SegmentType.ChordRest))) {
        if (!segmentsAreAdjacent(originalSeg, s)) {
            return null
        }
        const strack = staffIdx * VOICES
        const etrack = strack + VOICES
        // search through all tracks of current staff looking for a lyric in specified verse
        for (let track = strack; track < etrack; ++track) {
            const cr = s.element(track) as ChordRest | null
            if (cr) {
                // cr with lyrics found, but does it have a syllable in specified verse?
                l = cr.lyrics().find(ly => ly.placement() === p && ly.verse() === verse) ?? null
                if (l) {
                    break
                }
            }
        }
        if (l) {
            break
        }
    }
    return l
}

/** std::map<int, LyricsVerse>: iterate with sortedVerses() */
type LyricsVersesMap = Map<number, LyricsVerse>

function sortedVerses(m: LyricsVersesMap): [number, LyricsVerse][] {
    return [...m.entries()].sort((a, b) => a[0] - b[0])
}

function maxVerse(m: LyricsVersesMap): number {
    let max = 0
    let first = true
    for (const k of m.keys()) {
        if (first || k > max) {
            max = k
            first = false
        }
    }
    return max
}

/**
 * ChordRest::hasFollowingJumpItem()
 * TODO(port): repeat structure (findFollowingRepeatMeasures is not ported, so there are no jumps)
 */
function hasFollowingJumpItem(_cr: ChordRest): boolean {
    return false
}

const isLetter = (c: string): boolean => /\p{L}/u.test(c)
const isDigit = (c: string): boolean => /\p{Nd}/u.test(c)

export class LyricsLayout {
    static layout(item: Lyrics, ctx: LayoutContext): void {
        if (!item.explicitParent()) { // palette & clone trick
            item.setPos(new PointF())
            TextLayout.layoutBaseTextBase1(item)
            return
        }

        const ldata = item.mutldata()

        //
        // parse leading verse number and/or punctuation, so we can factor it into layout separately
        //
        let hasNumber = false // _verseNumber;

        // find:
        // 1) string of numbers and non-word characters at start of syllable
        // 2) at least one other character (indicating start of actual lyric)
        // 3) string of non-word characters at end of syllable
        const text = Array.from(item.plainText())
        let leading = ''
        let trailing = ''

        if (ctx.conf().styleB(Sid.lyricsAlignVerseNumber)) {
            let leadingIdx = 0
            for (let i = 0; i < text.length; ++i) {
                if (isLetter(text[i])) {
                    leadingIdx = i
                    break
                }
            }

            if (leadingIdx !== 0) {
                leading = text.slice(0, leadingIdx).join('')
            }

            let trailingIdx = text.length - 1
            for (let i = text.length - 1; i >= 0; --i) {
                if (isLetter(text[i])) {
                    trailingIdx = i
                    break
                }
            }

            if (trailingIdx !== text.length - 1) {
                trailing = text.slice(trailingIdx + 1).join('')
            }

            if (leading.length && isDigit(leading[0])) {
                hasNumber = true
            }
        }

        LyricsLayout.createOrRemoveLyricsLine(item, ctx)

        if (item.isMelisma() || hasNumber) {
            // use the melisma style alignment setting
            if (item.isStyled(Pid.POSITION)) {
                const separator = item.separator() as LyricsLine | null
                if (ctx.conf().styleB(Sid.lyricsCenterDashedSyllables) && !(separator && separator.isEndMelisma())) {
                    item.setPosition(AlignH.HCENTER)
                } else {
                    item.setPosition((ctx.conf().styleV(Sid.lyricsMelismaAlign) as Align).horizontal)
                }
            }
        } else {
            // use the text style alignment setting
            if (item.isStyled(Pid.POSITION)) {
                item.setPosition(item.propertyDefault(Pid.POSITION) as AlignH)
            }
        }
        const o = item.propertyDefault(Pid.OFFSET) as PointF

        const cr = item.chordRest()!
        let x = o.x() - cr.x()

        TextLayout.layoutBaseTextBase1(item, ldata)
        TextLayout.computeTextHighResShape(item, ldata)

        let centerAdjust = 0.0
        let leftAdjust = 0.0

        if (ctx.conf().styleB(Sid.lyricsAlignVerseNumber)) {
            // Calculate leading and trailing parts widths. Lyrics
            // should have text layout to be able to do it correctly.
            if (ldata.blocks.length && (leading.length || trailing.length)) {
                const tb = ldata.blocks[0]

                const leadingWidth = tb.xpos(Array.from(leading).length, item) - tb.boundingRect().x()
                const trailingPos = text.length - Array.from(trailing).length
                const trailingWidth = tb.boundingRect().right() - tb.xpos(trailingPos, item)

                leftAdjust = leadingWidth
                centerAdjust = leadingWidth - trailingWidth
            }
        }

        if (item.position() === AlignH.HCENTER) {
            //
            // center under notehead, not origin
            // however, lyrics that are melismas or have verse numbers will be forced to left alignment
            //
            // center under note head
            x += -centerAdjust * 0.5
        } else if (item.position() === AlignH.LEFT) {
            // even for left aligned syllables, ignore leading verse numbers and/or punctuation
            x -= leftAdjust
        }

        ldata.setPosX(x)

        if (item.ticks().isNotZero()) {
            // set melisma end
            const ecr = ctx.mutDom().findCR(item.endTick(), item.track())
            if (ecr) {
                ecr.setMelismaEnd(true)
            }
        }
    }

    /** C++ LyricsLayout::layout(LyricsLine*) */
    static layoutLyricsLine(item: LyricsLine): void {
        if (item.isDash()) { // dash(es)
            const lyrics = item.lyrics()!
            item.setNextLyrics(searchNextLyrics(lyrics.segment(), item.staffIdx(), lyrics.verse(), lyrics.placement()))
            item.setTrack2(item.nextLyrics() ? item.nextLyrics()!.track() : item.track())

            let endTick = item.tick()
            const lyricsMeasure = lyrics.segment().measure()
            const endCRSeg = lyricsMeasure ? lyricsMeasure.last(SegmentType.ChordRest) : null
            let endCR: ChordRest | null = null
            if (endCRSeg && !endCRSeg.empty()) {
                for (const cr of endCRSeg.elist()) {
                    if (cr && cr.isChordRest()) {
                        endCR = cr as ChordRest
                        break
                    }
                }
            }
            if (item.nextLyrics()) {
                endTick = item.nextLyrics()!.tick()
            } else if (endCR && hasFollowingJumpItem(endCR)) {
                endTick = endCR.tick()
            }
            item.setTick2(endTick)
        }
    }

    /** C++ LyricsLayout::layout(LyricsLineSegment*, LayoutContext&) */
    static layoutLyricsLineSegment(item: LyricsLineSegment, _ctx: LayoutContext): void {
        const ldata = item.mutldata()
        ldata.clearDashes()

        if (item.lyricsLine().isEndMelisma()) {
            LyricsLayout.layoutMelismaLine(item)
        } else {
            LyricsLayout.layoutDashes(item)
        }

        const halfLineWidth = item.absoluteFromSpatium(item.lineWidth())
        const rect = RectF.fromPoints(new PointF(), item.pos2()).adjusted(0.0, -halfLineWidth, 0.0, halfLineWidth)
        ldata.setShape(new Shape(rect, item))
    }

    private static layoutMelismaLine(item: LyricsLineSegment): void {
        const lyricsLine = item.lyricsLine()
        const startLyrics = lyricsLine.lyrics()!
        const system = item.system()
        if (!system) {
            return
        }
        const style = item.style()

        const startX = LyricsLayout.lyricsLineStartX(item)
        let endX = LyricsLayout.lyricsLineEndX(item, null)

        const tolerance = 0.05 * item.spatium()
        if (endX - startX < style.styleMM(Sid.lyricsMelismaMinLength) - tolerance) {
            const ticks = startLyrics.ticks()
            if (style.styleB(Sid.lyricsMelismaForce) || ticks.eq(TEMP_MELISMA_TICKS)) {
                endX = startX + style.styleMM(Sid.lyricsMelismaMinLength)
            } else {
                endX = startX
            }
        }

        LyricsLayout.adjustLyricsLineYOffset(item, null)

        item.mutldata().setPosX(startX)
        item.setPos2(new PointF(endX - startX, 0.0))
        item.mutldata().addDash(new LineF(new PointF(), item.pos2()))
    }

    private static layoutDashes(item: LyricsLineSegment): void {
        const lyricsLine = item.lyricsLine()
        const endEl = lyricsLine.endElement()
        const endCR = endEl && endEl.isChordRest() ? endEl as ChordRest : null
        let endLyrics: Lyrics | null = null
        if (endCR) {
            endLyrics = endCR.lyrics().find(lyr => lyr.verse() === item.verse()) ?? null
        }

        // When the end element is a timetick segment rather than a chordrest, the start element should be a chord with a following repeat
        const startEl = lyricsLine.startElement()
        const startCR = startEl && startEl.isChordRest() ? startEl as ChordRest : null
        const hasFollowingJump = endCR ? hasFollowingJumpItem(endCR) : (startCR ? hasFollowingJumpItem(startCR) : false)

        if (!endLyrics && !hasFollowingJump) {
            return
        }

        const system = item.system()
        if (!system) {
            return
        }
        const style = item.style()

        let startX = LyricsLayout.lyricsLineStartX(item)
        let endX = 0.0
        if (endCR) {
            endX = LyricsLayout.lyricsLineEndX(item, endLyrics)
        } else {
            endX = startCR ? startCR.measure()!.endingXForOpenEndedLines() : endX
        }

        LyricsLayout.adjustLyricsLineYOffset(item, endLyrics)

        item.mutldata().setPosX(startX)
        item.setPos2(new PointF(endX - startX, 0.0))

        const isDashOnFirstSyllable = lyricsLine.tick2().eq(system.firstMeasure()!.tick())
        const userStart = startX + item.offset().x()
        const userEnd = endX + item.userOff2().x()
        let curLength = userEnd - userStart
        const dashMinLength = style.styleMM(Sid.lyricsDashMinLength)
        const firstAndLastGapAreHalf = style.styleB(Sid.lyricsDashFirstAndLastGapAreHalf)
        const forceDash = style.styleB(Sid.lyricsDashForce)
                          || (style.styleB(Sid.lyricsShowDashIfSyllableOnFirstNote) && isDashOnFirstSyllable)
        const maxDashDistance = style.styleMM(Sid.lyricsDashMaxDistance)
        let dashCount = firstAndLastGapAreHalf && curLength > maxDashDistance ? Math.ceil(curLength / maxDashDistance)
            : Math.floor(curLength / maxDashDistance)

        if (curLength > dashMinLength || forceDash) {
            dashCount = Math.max(dashCount, 1)
        }

        if (style.styleB(Sid.lyricsLimitDashCount)) {
            dashCount = Math.min(dashCount, style.styleI(Sid.lyricsMaxDashCount))
        }

        if (curLength < dashMinLength && dashCount > 0) {
            const diff = dashMinLength - curLength
            if (isDashOnFirstSyllable) {
                startX -= diff
            } else {
                startX -= 0.5 * diff
                endX += 0.5 * diff
            }
            item.mutldata().setPosX(startX)
            item.setPos2(new PointF(endX - startX, 0.0))
            curLength = endX - startX
        }

        const dashWidth = Math.min(curLength, style.styleMM(Sid.lyricsDashMaxLength))

        const lyricsDashSystemStart = style.styleV(Sid.lyricsDashPosAtStartOfSystem) as LyricsDashSystemStart
        const dashesLeftAligned = lyricsDashSystemStart !== LyricsDashSystemStart.STANDARD && !item.isSingleBeginType()
        const dashDist = curLength / (dashesLeftAligned || firstAndLastGapAreHalf ? dashCount : dashCount + 1)
        let xDash = 0.0
        if (dashesLeftAligned) {
            for (let i = 0; i < dashCount; ++i) {
                item.mutldata().addDash(new LineF(new PointF(xDash, 0.0), new PointF(xDash + dashWidth, 0.0)))
                xDash += dashDist
            }
        } else {
            for (let i = 0; i < dashCount; ++i) {
                if (firstAndLastGapAreHalf && i === 0) {
                    xDash += 0.5 * dashDist
                } else {
                    xDash += dashDist
                }
                item.mutldata().addDash(new LineF(new PointF(xDash - 0.5 * dashWidth, 0.0), new PointF(xDash + 0.5 * dashWidth, 0.0)))
            }
        }
    }

    private static findNextLyrics(endChordRest: ChordRest | null, verseNumber: number): Lyrics | null {
        if (!endChordRest) {
            return null
        }
        for (let segment = endChordRest.segment()!.next1(SegmentType.ChordRest); segment; segment = segment.next1(SegmentType.ChordRest)) {
            const e = segment.element(endChordRest.track())
            if (!e) {
                continue
            }
            const lyr = (e as ChordRest).lyrics().find(l => l.verse() === verseNumber)
            if (lyr) {
                return lyr
            }
        }
        return null
    }

    static createOrRemoveLyricsLine(item: Lyrics, ctx: LayoutContext): void {
        // TODO(port): Lyrics::removeInvalidSegments (editing only)

        const isEndMelisma = (): boolean => item.ticks().isNotZero()

        let lyricsLineTicks = TEMP_MELISMA_TICKS

        // Update the end tick
        if (isEndMelisma()) {
            const track = item.track()
            const startSegment = item.segment()
            const startTick = startSegment.tick()

            // if lyrics has a temporary one-chord melisma, interpret as 0 ticks (just its own chord)
            const itemEndTick = item.ticks().eq(TEMP_MELISMA_TICKS) ? startTick : item.endTick()
            let endTick = itemEndTick

            let endSegment: Segment | null = startSegment
            while (endSegment && endSegment.tick().lt(endTick)) {
                endSegment = endSegment.nextCR(track, true)
            }
            if (!endSegment) {
                // user probably deleted measures at end of score, leaving this melisma too long
                // set endSegment to last segment and reset lyricsEndTick to trigger FIXUP code below
                endSegment = ctx.dom().lastSegment()
                endTick = new Fraction(-1, 1)
            }

            const endSegmentElement = endSegment!.element(track)
            if (endSegment!.tick().eq(endTick) && endSegmentElement && endSegmentElement.isChord()) {
                // everything is OK if we have reached a chord at right tick on right track
                // advance to next CR after duration of note, or last segment if no next CR
                const endChordSeg = endSegment!
                const endChord = endSegmentElement as Chord
                endSegment = endChordSeg.nextCR(track, false)
                if (!endSegment || endSegment.tick().gt(endChord.endTick())) {
                    endSegment = endChordSeg
                    while (endSegment && endSegment.tick().lt(endChord.endTick())) {
                        endSegment = endSegment.nextCR(nidx, true)
                    }
                }
            } else {
                // FIXUP - lyrics tick count not valid
                // this happens if edits to score have removed the original end segment
                // so let's fix it here
                // endSegment is already pointing to segment past endTick (or to last segment)
                // we should shorten the lyrics tick count to make this work
                const ns = endSegment!
                let ps = endSegment!.prev1(SegmentType.ChordRest)
                while (ps && ps !== startSegment) {
                    const pe = ps.element(track)
                    // we're looking for an actual chord on this track
                    if (pe && pe.isChord()) {
                        break
                    }
                    endSegment = ps
                    ps = ps.prev1(SegmentType.ChordRest)
                }
                if (!ps || ps === startSegment) {
                    // either there is no valid previous CR, or the previous CR is the one the lyric starts on
                    // we don't want to make the melisma longer arbitrarily, but there is a possibility that the next
                    // CR won't extend the melisma, so let's check it
                    ps = ns
                    endSegment = ps.nextCR(track, false)
                    const e = endSegment ? endSegment.element(track) : null
                    // check to make sure we have a chord
                    if (!e || !e.isChord() || ps.tick().gt(itemEndTick)) {
                        // nope, nothing to do but set ticks to 0
                        // this will result in no melisma
                        item.undoChangeProperty(Pid.LYRIC_TICKS, Fraction.fromTicks(0))
                    } else {
                        item.undoChangeProperty(Pid.LYRIC_TICKS, ps.tick().minus(startTick))
                    }
                } else {
                    item.undoChangeProperty(Pid.LYRIC_TICKS, ps.tick().minus(startTick))
                }
            }

            if (endSegment) {
                // Lyrics::_ticks points to the beginning of the last spanned segment,
                // but the line shall include it:
                // include the duration of this last segment in the melisma duration
                lyricsLineTicks = endSegment.tick().minus(startTick)
            } else {
                lyricsLineTicks = item.score().endTick().minus(startTick)
            }
        }

        const cr = item.chordRest()

        if (isEndMelisma() || item.syllabic() === LyricsSyllabic.BEGIN || item.syllabic() === LyricsSyllabic.MIDDLE) {
            if (!item.separator()) {
                const separator = new LyricsLine(ctx.dom().dummyParent())
                separator.setScore(item.score())
                separator.setTick(cr.tick())
                separator.setVisible(item.visible())
                item.setSeparator(separator)
                ctx.mutDom().addUnmanagedSpanner(separator)
            }
            const separator = item.separator() as LyricsLine
            separator.setParent(item)
            separator.setTick(cr.tick())
            separator.setTicks(lyricsLineTicks)
            separator.setTrack(item.track())
            separator.setTrack2(item.track())
            separator.styleChanged()
        } else {
            if (item.separator()) {
                item.separator()!.removeUnmanaged()
                item.setSeparator(null)
            }
        }
    }

    private static lyricsLineStartX(item: LyricsLineSegment): number {
        const system = item.system()!
        const lyricsLine = item.lyricsLine()
        const startLyrics = lyricsLine.lyrics()!
        const style = item.style()
        const melisma = lyricsLine.isEndMelisma()

        const lyricsDashSystemStart = style.styleV(Sid.lyricsDashPosAtStartOfSystem) as LyricsDashSystemStart
        const leading = melisma || (lyricsDashSystemStart !== LyricsDashSystemStart.UNDER_FIRST_NOTE)

        // Full melisma or dashes at beginning of system
        if (!item.isSingleBeginType()) {
            return system.firstNoteRestSegmentX(leading)
        }

        // Full melisma or dashes in middle of system
        const pad = melisma ? style.styleMM(Sid.lyricsMelismaPad) : style.styleMM(Sid.lyricsDashPad)
        const lyricsRightEdge = startLyrics.pageX() - system.pageX() + startLyrics.shape().right()
        return lyricsRightEdge + pad
    }

    private static lyricsLineEndX(item: LyricsLineSegment, endLyrics: Lyrics | null): number {
        const system = item.system()!
        const lyricsLine = item.lyricsLine()
        const endChordRest = lyricsLine.endElement() as ChordRest | null
        const systemPageX = system.pageX()
        const style = item.style()
        const melisma = lyricsLine.isEndMelisma()
        const hasFollowingJump = !!endChordRest && hasFollowingJumpItem(endChordRest)

        if (!melisma && !endLyrics && !hasFollowingJump) {
            return 0.0
        }

        const dashesEndOfSystem = !melisma && lyricsLine.tick2().eq(system.endTick())

        // Full melisma or dashes at end of system
        if (!item.isSingleEndType() || dashesEndOfSystem || !lyricsLine.endElement()) {
            return system.endingXForOpenEndedLines()
        }

        // TODO(port): partial dashes after a repeat, dashes before a repeat (repeat structure)

        // Full or partial dashes in middle of system
        if (!melisma && endLyrics) {
            const lyricsLeftEdge = endLyrics.pageX() - systemPageX + endLyrics.ldata().bbox().left()
            return lyricsLeftEdge - style.styleMM(Sid.lyricsDashPad)
        }

        // Full or partial melisma in middle of system
        if (endChordRest!.isChord()) {
            const endChord = endChordRest as Chord
            const note = endChord.up() ? endChord.downNote() : endChord.upNote()
            return note.pageX() - systemPageX + note.headWidth()
        }

        return endChordRest!.pageX() - systemPageX + endChordRest!.rightEdge()
    }

    private static adjustLyricsLineYOffset(item: LyricsLineSegment, endLyrics: Lyrics | null): void {
        const lyricsLine = item.lyricsLine()
        const endEl = lyricsLine.endElement()
        const endChordRest = endEl && endEl.isChordRest() ? endEl as ChordRest : null
        const startLyrics = lyricsLine.lyrics()!
        const melisma = lyricsLine.isEndMelisma()
        const ldata = item.mutldata()

        if (item.isSingleBeginType()) {
            ldata.setPosY(startLyrics.offset().y())
            return
        }

        if (melisma || !endLyrics) {
            const nextLyrics = LyricsLayout.findNextLyrics(endChordRest, item.verse())
            ldata.setPosY(nextLyrics ? nextLyrics.offset().y() : startLyrics.offset().y())
            return
        }

        ldata.setPosY(endLyrics.offset().y())
    }

    static computeVerticalPositions(system: System, ctx: LayoutContext): void {
        const nStaves = system.score().nstaves()
        for (let staffIdx = 0; staffIdx < nStaves; ++staffIdx) {
            if (system.staff(staffIdx)!.show()) {
                LyricsLayout.computeStaffVerticalPositions(staffIdx, system, ctx)
            }
        }
    }

    private static computeStaffVerticalPositions(staffIdx: staff_idx_t, system: System, ctx: LayoutContext): void {
        const lyricsVersesAbove: LyricsVersesMap = new Map()
        const lyricsVersesBelow: LyricsVersesMap = new Map()

        LyricsLayout.collectLyricsVerses(staffIdx, system, lyricsVersesAbove, lyricsVersesBelow)

        LyricsLayout.setDefaultPositions(staffIdx, lyricsVersesAbove, lyricsVersesBelow, ctx)

        LyricsLayout.checkCollisionsWithStaffElements(system, staffIdx, ctx, lyricsVersesAbove, lyricsVersesBelow)

        LyricsLayout.addToSkyline(system, staffIdx, ctx, lyricsVersesAbove, lyricsVersesBelow)
    }

    private static collectLyricsVerses(staffIdx: staff_idx_t, system: System, lyricsVersesAbove: LyricsVersesMap,
                                       lyricsVersesBelow: LyricsVersesMap): void {
        const startTrack = staffIdx * VOICES
        const endTrack = startTrack + VOICES
        const add = (m: LyricsVersesMap, verse: number, l: Lyrics): void => {
            let v = m.get(verse)
            if (!v) {
                v = new LyricsVerse()
                m.set(verse, v)
            }
            v.addLyrics(l)
        }
        const addLine = (m: LyricsVersesMap, verse: number, l: LyricsLineSegment): void => {
            let v = m.get(verse)
            if (!v) {
                v = new LyricsVerse()
                m.set(verse, v)
            }
            v.addLine(l)
        }

        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (let segment = (mb as Measure).first(); segment; segment = segment.next()) {
                if (!segment.isChordRestType()) {
                    continue
                }
                for (let track = startTrack; track < endTrack; ++track) {
                    const element = segment.element(track)
                    if (!element) {
                        continue
                    }
                    for (const lyrics of (element as ChordRest).lyrics()) {
                        const verse = lyrics.verse()
                        if (lyrics.placeAbove()) {
                            add(lyricsVersesAbove, verse, lyrics)
                        } else {
                            add(lyricsVersesBelow, verse, lyrics)
                        }
                    }
                }
            }
        }

        for (const spannerSegment of system.spannerSegments()) {
            if (spannerSegment.staffIdx() === staffIdx && spannerSegment.isLyricsLineSegment()) {
                if (RealIsNull(spannerSegment.pos2().x())) {
                    continue
                }
                const lyricsLineSegment = spannerSegment as LyricsLineSegment
                const verse = lyricsLineSegment.verse()
                if (lyricsLineSegment.lyricsPlaceAbove()) {
                    addLine(lyricsVersesAbove, verse, lyricsLineSegment)
                } else {
                    addLine(lyricsVersesBelow, verse, lyricsLineSegment)
                }
            }
        }
    }

    private static setDefaultPositions(staffIdx: staff_idx_t, lyricsVersesAbove: LyricsVersesMap, lyricsVersesBelow: LyricsVersesMap,
                                       ctx: LayoutContext): void {
        const staffHeight = ctx.dom().staff(staffIdx)!.staffHeight()
        const lyricsLineHeightFactor = ctx.conf().styleD(Sid.lyricsLineHeight)
        const maxVerseAbove = lyricsVersesAbove.size ? maxVerse(lyricsVersesAbove) : 0

        for (const [verse, lyricsVerse] of sortedVerses(lyricsVersesAbove)) {
            for (const lyrics of lyricsVerse.lyrics()) {
                const y = -(maxVerseAbove - verse) * lyrics.lineSpacing() * lyricsLineHeightFactor
                lyrics.setYRelativeToStaff(y)
            }
            for (const lyricsLineSegment of lyricsVerse.lines()) {
                const y = -(maxVerseAbove - verse) * lyricsLineSegment.lineSpacing() * lyricsLineHeightFactor
                lyricsLineSegment.move(new PointF(0.0, y + lyricsLineSegment.baseLineShift()))
            }
        }

        for (const [verse, lyricsVerse] of sortedVerses(lyricsVersesBelow)) {
            for (const lyrics of lyricsVerse.lyrics()) {
                const y = staffHeight + verse * lyrics.lineSpacing() * lyricsLineHeightFactor
                lyrics.setYRelativeToStaff(y)
            }
            for (const lyricsLineSegment of lyricsVerse.lines()) {
                const y = staffHeight + verse * lyricsLineSegment.lineSpacing() * lyricsLineHeightFactor
                lyricsLineSegment.move(new PointF(0.0, y + lyricsLineSegment.baseLineShift()))
            }
        }
    }

    private static checkCollisionsWithStaffElements(system: System, staffIdx: staff_idx_t, ctx: LayoutContext,
                                                    lyricsVersesAbove: LyricsVersesMap, lyricsVersesBelow: LyricsVersesMap): void {
        const systemStaff = system.staff(staffIdx)!
        const lyricsMinDist = ctx.conf().styleMM(Sid.lyricsMinTopDistance)

        const staffSkylineNorth = systemStaff.skyline().north()
        const staffSkylineSouth = systemStaff.skyline().south()

        const maxVerseAbove = lyricsVersesAbove.size ? maxVerse(lyricsVersesAbove) : 0
        const maxVerseBelow = lyricsVersesBelow.size ? maxVerse(lyricsVersesBelow) : 0

        for (let verse = maxVerseAbove; verse >= 0; --verse) {
            if (!lyricsVersesAbove.has(verse)) {
                continue
            }
            const verseSkyline = LyricsLayout.createSkylineForVerse(verse, false, lyricsVersesAbove, system)
            const minDistance = -verseSkyline.minDistance(staffSkylineNorth)
            if (minDistance < lyricsMinDist) {
                const diff = lyricsMinDist - minDistance
                LyricsLayout.moveThisVerseAndOuterOnes(verse, 0, true, -diff, lyricsVersesAbove)
            }
        }

        for (let verse = 0; verse <= maxVerseBelow; ++verse) {
            if (!lyricsVersesBelow.has(verse)) {
                continue
            }
            const verseSkyline = LyricsLayout.createSkylineForVerse(verse, true, lyricsVersesBelow, system)
            const minDistance = -staffSkylineSouth.minDistance(verseSkyline)
            if (minDistance < lyricsMinDist) {
                const diff = lyricsMinDist - minDistance
                LyricsLayout.moveThisVerseAndOuterOnes(verse, maxVerseBelow, false, diff, lyricsVersesBelow)
            }
        }
    }

    private static createSkylineForVerse(verse: number, north: boolean, lyricsVerses: LyricsVersesMap, system: System): SkylineLine {
        const systemX = system.pageX()
        const lyricsSkyline = new SkylineLine(north)
        const lyricsVerse = lyricsVerses.get(verse)
        if (lyricsVerse) {
            for (const lyrics of lyricsVerse.lyrics()) {
                if (lyrics.addToSkyline()) {
                    const lyricsShape = lyrics.ldata().highResShape.translated(new PointF(lyrics.pageX() - systemX, lyrics.yRelativeToStaff()))
                    lyricsSkyline.add(lyricsShape)
                }
            }
            for (const lyricsLineSeg of lyricsVerse.lines()) {
                if (lyricsLineSeg.lyricsAddToSkyline()) {
                    lyricsSkyline.add(lyricsLineSeg.shape().translate(lyricsLineSeg.pos()))
                }
            }
        }
        return lyricsSkyline
    }

    private static moveThisVerseAndOuterOnes(verse: number, lastVerse: number, above: boolean, diff: number,
                                             lyricsVerses: LyricsVersesMap): void {
        const moveVerse = (v: number): void => {
            const lyricsVerse = lyricsVerses.get(v)
            if (lyricsVerse) {
                for (const lyrics of lyricsVerse.lyrics()) {
                    lyrics.move(new PointF(0.0, diff))
                }
                for (const lyricsLineSeg of lyricsVerse.lines()) {
                    lyricsLineSeg.move(new PointF(0.0, diff))
                }
            }
        }

        if (above) {
            for (let otherVerse = verse; otherVerse >= lastVerse; --otherVerse) {
                moveVerse(otherVerse)
            }
        } else {
            for (let otherVerse = verse; otherVerse <= lastVerse; ++otherVerse) {
                moveVerse(otherVerse)
            }
        }
    }

    private static addToSkyline(system: System, staffIdx: staff_idx_t, ctx: LayoutContext, lyricsVersesAbove: LyricsVersesMap,
                                lyricsVersesBelow: LyricsVersesMap): void {
        const systemX = system.pageX()
        const lyricsVerticalPadding = ctx.conf().styleMM(Sid.lyricsMinBottomDistance) - ctx.conf().styleMM(Sid.minVerticalDistance)
        const skyline = system.staff(staffIdx)!.skyline()

        for (const [, lyricsVerse] of sortedVerses(lyricsVersesAbove)) {
            for (const lyrics of lyricsVerse.lyrics()) {
                if (lyrics.addToSkyline()) {
                    const lyricsShape = lyrics.ldata().highResShape.translated(new PointF(lyrics.pageX() - systemX, lyrics.yRelativeToStaff()))
                    skyline.north().add(lyricsShape.adjust(0.0, -lyricsVerticalPadding, 0.0, 0.0))
                }
            }
            for (const lyricsLineSeg of lyricsVerse.lines()) {
                if (lyricsLineSeg.lyricsAddToSkyline()) {
                    const lineShape = lyricsLineSeg.shape().translate(lyricsLineSeg.pos())
                    skyline.north().add(lineShape.adjust(0.0, -lyricsVerticalPadding, 0.0, 0.0))
                }
            }
        }

        for (const [, lyricsVerse] of sortedVerses(lyricsVersesBelow)) {
            for (const lyrics of lyricsVerse.lyrics()) {
                if (lyrics.addToSkyline()) {
                    const lyricsShape = lyrics.ldata().highResShape.translated(new PointF(lyrics.pageX() - systemX, lyrics.yRelativeToStaff()))
                    skyline.south().add(lyricsShape.adjust(0.0, 0.0, 0.0, lyricsVerticalPadding))
                }
            }
            for (const lyricsLineSeg of lyricsVerse.lines()) {
                if (lyricsLineSeg.lyricsAddToSkyline()) {
                    const lineShape = lyricsLineSeg.shape().translate(lyricsLineSeg.pos())
                    skyline.south().add(lineShape.adjust(0.0, 0.0, 0.0, lyricsVerticalPadding))
                }
            }
        }
    }
}
