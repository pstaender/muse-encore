/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/lyricslayout.h/.cpp
 *
 * TODO(port): lyrics lines (melisma lines and dashes, createOrRemoveLyricsLine), partial lyrics lines
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

class LyricsVerse {
    private m_lyrics: Lyrics[] = []

    addLyrics(l: Lyrics): void { this.m_lyrics.push(l) }
    lyrics(): readonly Lyrics[] { return this.m_lyrics }
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

        // TODO(port): LyricsLayout::createOrRemoveLyricsLine

        if (item.isMelisma() || hasNumber) {
            // use the melisma style alignment setting
            if (item.isStyled(Pid.POSITION)) {
                // TODO(port): separator()->isEndMelisma() (lyrics lines)
                if (ctx.conf().styleB(Sid.lyricsCenterDashedSyllables) && !(item.ticks().isNotZero())) {
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

        // TODO(port): lyrics line segments
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
        }

        for (const [verse, lyricsVerse] of sortedVerses(lyricsVersesBelow)) {
            for (const lyrics of lyricsVerse.lyrics()) {
                const y = staffHeight + verse * lyrics.lineSpacing() * lyricsLineHeightFactor
                lyrics.setYRelativeToStaff(y)
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
        }

        for (const [, lyricsVerse] of sortedVerses(lyricsVersesBelow)) {
            for (const lyrics of lyricsVerse.lyrics()) {
                if (lyrics.addToSkyline()) {
                    const lyricsShape = lyrics.ldata().highResShape.translated(new PointF(lyrics.pageX() - systemX, lyrics.yRelativeToStaff()))
                    skyline.south().add(lyricsShape.adjust(0.0, 0.0, 0.0, lyricsVerticalPadding))
                }
            }
        }
    }
}
